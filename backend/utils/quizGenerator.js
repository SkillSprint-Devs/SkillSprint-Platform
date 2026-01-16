import Question from "../models/question.js";

/**
 * Quiz Generator Utility
 * - Randomly selects questions from the pool
 * - Shuffles question order
 * - Shuffles option order (returns mapping for scoring)
 * - Excludes recently used questions
l
 */

// Quiz configuration per level
export const QUIZ_CONFIG = {
    basic: { questionCount: 15, timeMinutes: 15, negativeMarking: false },
    intermediate: { questionCount: 15, timeMinutes: 20, negativeMarking: false },
    advanced: { questionCount: 12, timeMinutes: 25, negativeMarking: true, negativeValue: 0.25 }
};

export const PASS_THRESHOLD = 70; // Percentage required to pass

/**
 * Shuffle array using Fisher-Yates algorithm
 * Returns both shuffled array and the shuffle mapping
 */
function shuffleWithMapping(arr) {
    const indices = arr.map((_, i) => i);
    const shuffled = [...arr];

    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    return { shuffled, originalIndices: indices };
}

/**
 * Generate a quiz for a user
 * @param {string} course - Course ID
 * @param {string} level - Level (basic/intermediate/advanced)
 * @param {string[]} excludeQuestionIds - IDs of recently used questions to exclude
 * @returns {Object} Quiz data with questions (no correct answers)
 */
export async function generateQuiz(course, level, excludeQuestionIds = []) {
    const config = QUIZ_CONFIG[level];
    if (!config) {
        throw new Error(`Invalid level: ${level}`);
    }

    // Fetch available questions, excluding recently used
    const query = {
        course,
        level,
        ...(excludeQuestionIds.length > 0 && { _id: { $nin: excludeQuestionIds } })
    };

    const availableQuestions = await Question.find(query);

    if (availableQuestions.length < config.questionCount) {
        // If not enough new questions, include some recent ones
        const allQuestions = await Question.find({ course, level });
        if (allQuestions.length < config.questionCount) {
            throw new Error(`Not enough questions for ${course} ${level}. Need ${config.questionCount}, found ${allQuestions.length}`);
        }
        // Use all questions
        availableQuestions.length = 0;
        availableQuestions.push(...allQuestions);
    }

    // Filter out questions without valid options
    const validQuestions = availableQuestions.filter(q =>
        q.options &&
        Array.isArray(q.options) &&
        q.options.length >= 2 &&
        q.options.every(opt => opt && opt.text)
    );

    if (validQuestions.length < config.questionCount) {
        console.warn(`Warning: Only ${validQuestions.length} valid questions for ${course} ${level}`);
    }

    // Randomly select questions from valid ones
    const { shuffled: shuffledQuestions } = shuffleWithMapping(validQuestions);
    const selectedQuestions = shuffledQuestions.slice(0, config.questionCount);

    // Prepare questions for frontend (no correct answers!)
    const questionsForClient = [];
    const questionIds = [];
    const shuffledOptionIndexes = [];

    for (const q of selectedQuestions) {
        questionIds.push(q._id);

        // Shuffle options and track the mapping
        const optionTexts = q.options.map(o => o.text);
        const { shuffled: shuffledOptions, originalIndices } = shuffleWithMapping(optionTexts);

        shuffledOptionIndexes.push(originalIndices);

        // Send to client WITHOUT isCorrect
        questionsForClient.push({
            _id: q._id,
            question: q.question,
            codeSnippet: q.codeSnippet || null,
            type: q.type,
            topic: q.topic,
            options: shuffledOptions // Just strings, no isCorrect
        });
    }

    return {
        questions: questionsForClient,
        questionIds,
        shuffledOptionIndexes,
        config
    };
}

/**
 * Calculate quiz score
 * @param {Object[]} questionDocs - Full question documents with correct answers
 * @param {Number[][]} shuffledOptionIndexes - Option shuffle mapping per question
 * @param {Number[]} userAnswers - User's selected option indexes (into shuffled options)
 * @param {string} level - Quiz level for scoring rules
 * @returns {Object} Score details
 */
export function calculateScore(questionDocs, shuffledOptionIndexes, userAnswers, level) {
    const config = QUIZ_CONFIG[level];
    let correctCount = 0;
    let wrongCount = 0;
    let unanswered = 0;
    const topicPerformance = {};

    for (let i = 0; i < questionDocs.length; i++) {
        const question = questionDocs[i];
        const userAnswer = userAnswers[i];
        const originalIndices = shuffledOptionIndexes[i];

        // Initialize topic tracking
        if (!topicPerformance[question.topic]) {
            topicPerformance[question.topic] = { correct: 0, total: 0 };
        }
        topicPerformance[question.topic].total++;

        if (userAnswer === -1 || userAnswer === undefined || userAnswer === null) {
            unanswered++;
            continue;
        }

        // Map user's shuffled answer back to original option index
        const originalOptionIndex = originalIndices[userAnswer];
        const isCorrect = question.options[originalOptionIndex]?.isCorrect === true;

        if (isCorrect) {
            correctCount++;
            topicPerformance[question.topic].correct++;
        } else {
            wrongCount++;
        }
    }

    // Calculate score
    let score;
    const totalQuestions = questionDocs.length;

    if (config.negativeMarking) {
        // Advanced level: negative marking
        const rawScore = correctCount - (config.negativeValue * wrongCount);
        score = Math.max(0, (rawScore / totalQuestions) * 100);
    } else {
        score = (correctCount / totalQuestions) * 100;
    }

    score = Math.round(score * 100) / 100; // Round to 2 decimals

    return {
        score,
        correctCount,
        wrongCount,
        unanswered,
        totalQuestions,
        passed: score >= PASS_THRESHOLD,
        topicPerformance
    };
}

/**
 * Generate feedback based on topic performance
 */
export function generateFeedback(topicPerformance) {
    const feedback = {
        strengths: [],
        weaknesses: [],
        suggestions: []
    };

    for (const [topic, stats] of Object.entries(topicPerformance)) {
        const percentage = (stats.correct / stats.total) * 100;

        if (percentage >= 80) {
            feedback.strengths.push({ topic, percentage: Math.round(percentage), stats });
        } else if (percentage < 50) {
            feedback.weaknesses.push({ topic, percentage: Math.round(percentage), stats });
            feedback.suggestions.push(`Focus more on ${topic} concepts`);
        }
    }

    return feedback;
}
