import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import Question, { COURSES, LEVELS } from "../models/question.js";
import QuizAttempt from "../models/quizAttempt.js";
import Certificate from "../models/certificate.js";
import Achievement from "../models/achievement.js";
import {
    generateQuiz,
    calculateScore,
    generateFeedback,
    QUIZ_CONFIG,
    PASS_THRESHOLD
} from "../utils/quizGenerator.js";
import { updateStreak } from "../utils/streakHelper.js";

const router = express.Router();

const DAILY_ATTEMPT_LIMIT = 3;

// ============================================================
// GET /api/quiz/courses - List all courses with user progress
// ============================================================
router.get("/courses", verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const courseData = await Promise.all(
            COURSES.map(async (course) => {
                // Get best attempts for each level
                const levelStatus = {};

                for (const level of LEVELS) {
                    const bestAttempt = await QuizAttempt.findOne({
                        user: userId,
                        course,
                        level,
                        status: "submitted",
                        passed: true
                    }).sort({ score: -1 });

                    levelStatus[level] = {
                        passed: !!bestAttempt,
                        bestScore: bestAttempt?.score || 0,
                        unlocked: level === "basic" ? true : levelStatus[LEVELS[LEVELS.indexOf(level) - 1]]?.passed || false
                    };
                }

                // Fix unlock logic: intermediate unlocked if basic passed, etc.
                levelStatus.intermediate.unlocked = levelStatus.basic.passed;
                levelStatus.advanced.unlocked = levelStatus.intermediate.passed;

                // Check for certificate
                const certificate = await Certificate.findOne({ user: userId, course });

                return {
                    id: course,
                    name: formatCourseName(course),
                    levels: levelStatus,
                    hasCertificate: !!certificate,
                    certificateId: certificate?.verificationId || null
                };
            })
        );

        res.json({ courses: courseData });
    } catch (err) {
        console.error("Get courses error:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// ============================================================
// GET /api/quiz/active - Check for in-progress quiz
// ============================================================
router.get("/active", verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const activeQuiz = await QuizAttempt.findOne({
            user: userId,
            status: "in-progress",
            expiresAt: { $gt: new Date() }
        });

        if (!activeQuiz) {
            return res.json({ hasActiveQuiz: false });
        }

        // Return quiz data without correct answers
        const questions = await Question.find({
            _id: { $in: activeQuiz.questionIds }
        });

        const questionsForClient = questions.map((q, i) => ({
            _id: q._id,
            question: q.question,
            codeSnippet: q.codeSnippet || null,
            type: q.type,
            topic: q.topic,
            options: activeQuiz.shuffledOptionIndexes[i].map(idx => q.options[idx].text)
        }));

        res.json({
            hasActiveQuiz: true,
            quizId: activeQuiz._id,
            course: activeQuiz.course,
            level: activeQuiz.level,
            questions: questionsForClient,
            userAnswers: activeQuiz.userAnswers,
            expiresAt: activeQuiz.expiresAt,
            startedAt: activeQuiz.startedAt
        });
    } catch (err) {
        console.error("Get active quiz error:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// ============================================================
// GET /api/quiz/attempts/today - Get remaining attempts
// ============================================================
router.get("/attempts/today", verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { course, level } = req.query;

        if (!course || !level) {
            return res.status(400).json({ message: "Course and level required" });
        }

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const attemptsToday = await QuizAttempt.countDocuments({
            user: userId,
            startedAt: { $gte: todayStart }
        });

        res.json({
            attemptsUsed: attemptsToday,
            attemptsRemaining: Math.max(0, DAILY_ATTEMPT_LIMIT - attemptsToday),
            limit: DAILY_ATTEMPT_LIMIT
        });
    } catch (err) {
        console.error("Get attempts error:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// ============================================================
// POST /api/quiz/start - Start a new quiz
// ============================================================
router.post("/start", verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { course, level } = req.body;

        // Validate input
        if (!COURSES.includes(course)) {
            return res.status(400).json({ message: "Invalid course" });
        }
        if (!LEVELS.includes(level)) {
            return res.status(400).json({ message: "Invalid level" });
        }

        // Check for existing active quiz (session locking)
        const existingQuiz = await QuizAttempt.findOne({
            user: userId,
            status: "in-progress",
            expiresAt: { $gt: new Date() }
        });

        if (existingQuiz) {
            // Return existing quiz instead of creating new
            const questions = await Question.find({
                _id: { $in: existingQuiz.questionIds }
            });

            const questionsForClient = questions.map((q, i) => ({
                _id: q._id,
                question: q.question,
                codeSnippet: q.codeSnippet || null,
                type: q.type,
                topic: q.topic,
                options: existingQuiz.shuffledOptionIndexes[i].map(idx => q.options[idx].text)
            }));

            return res.json({
                quizId: existingQuiz._id,
                course: existingQuiz.course,
                level: existingQuiz.level,
                questions: questionsForClient,
                userAnswers: existingQuiz.userAnswers,
                expiresAt: existingQuiz.expiresAt,
                startedAt: existingQuiz.startedAt,
                timeLimit: QUIZ_CONFIG[existingQuiz.level].timeMinutes,
                resumed: true
            });
        }

        // Expire any old in-progress quizzes
        await QuizAttempt.updateMany(
            { user: userId, status: "in-progress", expiresAt: { $lte: new Date() } },
            { status: "expired" }
        );

        // Check level unlock
        if (level !== "basic") {
            const prevLevel = LEVELS[LEVELS.indexOf(level) - 1];
            const prevPassed = await QuizAttempt.findOne({
                user: userId,
                course,
                level: prevLevel,
                passed: true
            });

            if (!prevPassed) {
                return res.status(403).json({
                    message: `Must pass ${prevLevel} level first`
                });
            }
        }

        // Check daily attempt limit
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const attemptsToday = await QuizAttempt.countDocuments({
            user: userId,
            course,
            level,
            startedAt: { $gte: todayStart }
        });

        if (attemptsToday >= DAILY_ATTEMPT_LIMIT) {
            return res.status(429).json({
                message: `Daily limit reached. Try again tomorrow.`,
                attemptsUsed: attemptsToday,
                limit: DAILY_ATTEMPT_LIMIT
            });
        }

        // Get recently used question IDs (last 50)
        const recentAttempts = await QuizAttempt.find({
            user: userId,
            course,
            level
        }).sort({ startedAt: -1 }).limit(3).select("questionIds");

        const recentQuestionIds = recentAttempts.flatMap(a => a.questionIds);

        // Generate quiz
        const { questions, questionIds, shuffledOptionIndexes, config } =
            await generateQuiz(course, level, recentQuestionIds);

        // Calculate expiry
        const expiresAt = new Date(Date.now() + config.timeMinutes * 60 * 1000);

        // Create quiz attempt
        const quizAttempt = await QuizAttempt.create({
            user: userId,
            course,
            level,
            status: "in-progress",
            expiresAt,
            questionIds,
            shuffledOptionIndexes,
            userAnswers: new Array(questions.length).fill(-1)
        });

        // Update Streak Activity
        await updateStreak(userId);

        res.json({
            quizId: quizAttempt._id,
            course,
            level,
            questions,
            userAnswers: quizAttempt.userAnswers,
            expiresAt,
            startedAt: quizAttempt.startedAt,
            timeLimit: config.timeMinutes,
            resumed: false
        });
    } catch (err) {
        console.error("Start quiz error:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// ============================================================
// POST /api/quiz/save - Save answers (auto-save during quiz)
// ============================================================
router.post("/save", verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { quizId, answers } = req.body;

        const quiz = await QuizAttempt.findOne({
            _id: quizId,
            user: userId,
            status: "in-progress"
        });

        if (!quiz) {
            return res.status(404).json({ message: "Quiz not found or already submitted" });
        }

        quiz.userAnswers = answers;
        await quiz.save();

        res.json({ saved: true });
    } catch (err) {
        console.error("Save quiz error:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// ============================================================
// POST /api/quiz/submit - Submit quiz answers
// ============================================================
router.post("/submit", verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { quizId, answers } = req.body;

        const quiz = await QuizAttempt.findOne({
            _id: quizId,
            user: userId
        });

        if (!quiz) {
            return res.status(404).json({ message: "Quiz not found" });
        }

        if (quiz.status === "submitted") {
            // Already submitted, return existing results
            return res.json({
                alreadySubmitted: true,
                score: quiz.score,
                correctCount: quiz.correctCount,
                wrongCount: quiz.wrongCount,
                passed: quiz.passed,
                topicPerformance: quiz.topicPerformance
            });
        }

        // Check if expired
        if (quiz.status === "expired" || new Date() > quiz.expiresAt) {
            quiz.status = "expired";
            await quiz.save();
            return res.status(400).json({ message: "Quiz expired" });
        }

        // Get full question documents for scoring
        const questions = await Question.find({
            _id: { $in: quiz.questionIds }
        });

        // Order questions same as quiz
        const orderedQuestions = quiz.questionIds.map(id =>
            questions.find(q => q._id.equals(id))
        );

        // Calculate score
        const userAnswers = answers || quiz.userAnswers;
        const result = calculateScore(
            orderedQuestions,
            quiz.shuffledOptionIndexes,
            userAnswers,
            quiz.level
        );

        // Update quiz attempt
        quiz.status = "submitted";
        quiz.submittedAt = new Date();
        quiz.userAnswers = userAnswers;
        quiz.score = result.score;
        quiz.correctCount = result.correctCount;
        quiz.wrongCount = result.wrongCount;
        quiz.passed = result.passed;
        quiz.topicPerformance = result.topicPerformance;
        await quiz.save();

        // Generate feedback
        const feedback = generateFeedback(result.topicPerformance);

        // Check for certificate eligibility
        let certificateAwarded = null;
        if (result.passed && quiz.level === "advanced") {
            certificateAwarded = await checkAndAwardCertificate(userId, quiz.course);
        }

        res.json({
            score: result.score,
            correctCount: result.correctCount,
            wrongCount: result.wrongCount,
            unanswered: result.unanswered,
            totalQuestions: result.totalQuestions,
            passed: result.passed,
            topicPerformance: result.topicPerformance,
            feedback,
            certificateAwarded,
            achievementAwarded: result.passed ? await awardAchievement(userId, quiz.course, quiz.level, result.score, certificateAwarded?.verificationId) : null
        });
    } catch (err) {
        console.error("Submit quiz error:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// ============================================================
// GET /api/quiz/progress/:course - Detailed progress
// ============================================================
router.get("/progress/:course", verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { course } = req.params;

        if (!COURSES.includes(course)) {
            return res.status(400).json({ message: "Invalid course" });
        }

        const levelProgress = {};

        for (const level of LEVELS) {
            const attempts = await QuizAttempt.find({
                user: userId,
                course,
                level,
                status: "submitted"
            }).sort({ startedAt: -1 }).limit(5);

            const bestAttempt = attempts.reduce((best, curr) =>
                curr.score > (best?.score || 0) ? curr : best, null
            );

            levelProgress[level] = {
                attempts: attempts.length,
                bestScore: bestAttempt?.score || 0,
                passed: bestAttempt?.passed || false,
                lastAttempt: attempts[0]?.submittedAt || null,
                topicPerformance: bestAttempt?.topicPerformance || {}
            };
        }

        const certificate = await Certificate.findOne({ user: userId, course });

        res.json({
            course,
            levels: levelProgress,
            certificate: certificate ? {
                verificationId: certificate.verificationId,
                overallScore: certificate.overallScore,
                issuedAt: certificate.issuedAt
            } : null
        });
    } catch (err) {
        console.error("Get progress error:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// ============================================================
// Helper: Check and award certificate
// ============================================================
async function checkAndAwardCertificate(userId, course) {
    // Check if already has certificate
    const existing = await Certificate.findOne({ user: userId, course });
    if (existing) {
        return {
            awarded: false,
            reason: "already_certified",
            verificationId: existing.verificationId
        };
    }

    // Check all levels passed
    const levelScores = {};

    for (const level of LEVELS) {
        const bestPass = await QuizAttempt.findOne({
            user: userId,
            course,
            level,
            passed: true
        }).sort({ score: -1 });

        if (!bestPass) {
            return { awarded: false, reason: `${level}_not_passed` };
        }

        levelScores[level] = bestPass.score;
    }

    // Calculate overall score
    const overallScore = (levelScores.basic + levelScores.intermediate + levelScores.advanced) / 3;

    if (overallScore < PASS_THRESHOLD) {
        return {
            awarded: false,
            reason: "overall_score_low",
            overallScore
        };
    }

    // Award certificate!
    const certificate = await Certificate.create({
        user: userId,
        course,
        levelScores,
        overallScore: Math.round(overallScore * 100) / 100
    });

    return {
        awarded: true,
        verificationId: certificate.verificationId,
        overallScore: certificate.overallScore,
        issuedAt: certificate.issuedAt
    };
}

// ============================================================
// Helper: Award Achievement
// ============================================================
async function awardAchievement(userId, course, level, score, verificationId) {
    try {
        const achievementType = level === "advanced" ? "certificate" : "badge";
        const badgeTier = level === "basic" ? "silver" : (level === "intermediate" ? "gold" : null);
        const title = level === "advanced" ? "Certificate of Achievement" : `${level.charAt(0).toUpperCase() + level.slice(1)} Level Completed`;
        const description = level === "advanced" ? `Awarded for completing all levels of ${formatCourseName(course)}` : `Awarded for successfully completing the ${level} level of ${formatCourseName(course)}`;
        const reason = `${level} level passed`;

        // Check for existing achievement
        const existing = await Achievement.findOne({ user: userId, course, level, achievementType });
        if (existing) return { awarded: false, reason: "already_awarded" };

        const achievementData = {
            user: userId,
            course,
            level,
            achievementType,
            badgeTier,
            title,
            description,
            reason,
            awardedAt: new Date()
        };

        if (level === "advanced") {
            achievementData.overallScore = score;
            achievementData.verificationId = verificationId;
        }

        const achievement = await Achievement.create(achievementData);

        return {
            awarded: true,
            type: achievementType,
            tier: badgeTier,
            title: achievement.title
        };
    } catch (err) {
        console.error("Award achievement error:", err);
        return { awarded: false, error: err.message };
    }
}

// Helper: Format course name
function formatCourseName(course) {
    const names = {
        "html-css": "HTML & CSS",
        "javascript": "JavaScript",
        "git-github": "Git & GitHub",
        "nodejs-express": "Node.js & Express",
        "mongodb": "MongoDB",
        "problem-solving": "Problem Solving"
    };
    return names[course] || course;
}

export default router;
