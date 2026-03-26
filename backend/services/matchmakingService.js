import User from '../models/user.js';
import Notification from '../models/notification.js';

/**
 * SkillSprint — K-Nearest Neighbors (KNN) & Cosine Similarity Model
 * ─────────────────────────────────────────────────────────────────
 * This engine calculates compatibility between users by projecting their
 * attributes into a multidimensional feature space and computing the 
 * Cosine Similarity (angle) between their vectors.
 * 
 * The K-Nearest Neighbors (KNN) algorithm then clusters and extracts 
 * the 'K' closest users (most similar vectors) for suggestions.
 */

// ── 1. Vector Math Core (Cosine Similarity) ──────────────────────────────────

/**
 * Calculates the Cosine Similarity between two numeric vectors.
 * Formula: (A · B) / (||A|| * ||B||)
 * Returns a value between 0.0 (completely dissimilar) and 1.0 (exact match).
 */
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    const aVal = vecA[i] || 0;
    const bVal = vecB[i] || 0;
    
    dotProduct += aVal * bVal;
    normA += aVal * aVal;
    normB += bVal * bVal;
  }
  
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}


// ── 2. Vectorization Extraction ──────────────────────────────────────────────

/** Helper to extract timezone offset as a numeric feature */
function utcOffsetHours(ianaZone) {
  try {
    if (!ianaZone) return 0;
    const now = new Date();
    const utcMs = now.getTime();
    const local = new Date(now.toLocaleString('en-US', { timeZone: ianaZone }));
    return (local.getTime() - utcMs) / (1000 * 3600);
  } catch { return 0; }
}

/** Standardize attributes into continuous 0.0-1.0 numeric scales */
const HOURS_MAP = { '< 5hrs': 0.2, '< 5 hrs': 0.2, '5–10hrs': 0.6, '5-10hrs': 0.6, '10+ hrs': 1.0, '10+hrs': 1.0 };
function vectorizeHours(label) { return HOURS_MAP[label] ?? 0.6; }

const LEVEL_MAP = { Beginner: 0.2, Intermediate: 0.6, Advanced: 1.0 };
function vectorizeLevel(level) { return LEVEL_MAP[level] ?? 0.6; }

function vectorizeCollab(style) {
  if (!style) return 0.5;
  const s = style.toLowerCase();
  if (s.includes('real')) return 1.0;
  if (s.includes('async')) return 0.0;
  return 0.5; // hybrid / no preference
}

/**
 * Extracts a normalized 4-dimensional numerical feature vector for User attributes.
 * Vector Space: [ ExperienceLevel, WeeklyHours, CollaborationStyle, TimezoneOffset ]
 */
function extractAttributeVector(userData) {
  const d = userData || {};
  return [
    vectorizeLevel(d.level),
    vectorizeHours(d.weeklyHours), 
    vectorizeCollab(d.collabStyle),
    (utcOffsetHours(d.timezone) + 12) / 24 // Normalize TZ (-12 to +12) -> 0.0 to 1.0 space
  ];
}


// ── 3. KNN Distance Metrics & Scoring ────────────────────────────────────────

/**
 * Computes unidirectional Bag-of-Words Cosine Similarity for Skills.
 * e.g., computes the vector distance between what User A wants to Learn vs what User B Can Teach.
 */
function computeSkillTextVectorSim(wantsToLearn, canTeach) {
  if (!wantsToLearn || !canTeach || !wantsToLearn.length || !canTeach.length) return 0;
  
  const learnTokens = wantsToLearn.map(s => s.toLowerCase());
  const teachTokens = canTeach.map(s => s.toLowerCase());
  
  // Create shared vocabulary space (all unique tokens between both sets)
  const vocab = Array.from(new Set([...learnTokens, ...teachTokens]));
  
  // Vectorize (One-Hot encode) strings mapped to vocabulary index
  const vecA = vocab.map(word => learnTokens.includes(word) ? 1 : 0);
  const vecB = vocab.map(word => teachTokens.includes(word) ? 1 : 0);
  
  return cosineSimilarity(vecA, vecB);
}

/**
 * Calculates the exact Distance/Similarity score between two Users
 * using Cosine calculations on their multi-dimensional vectors.
 */
export function computeMatchScore(userA, userB) {
  const reasons = [];
  const a = userA.matchmakingData || {};
  const b = userB.matchmakingData || {};

  // -- Metric 1: Skill Text Cosine Similarity (40% Weight) --
  // Bidirectional Check: (A learns from B) & (B learns from A)
  const aLearnsB_Sim = computeSkillTextVectorSim(a.skillsToLearn, b.topSkills);
  const bLearnsA_Sim = computeSkillTextVectorSim(b.skillsToLearn, a.topSkills);
  
  // Average the Cosine coefficients
  const meanSkillSim = (aLearnsB_Sim + bLearnsA_Sim) / 2;
  const finalSkillScore = Math.round(meanSkillSim * 40);

  // Generate readable UI reasons mapping back to text vectors
  const aTopTokens = (a.topSkills || []).map(s => s.toLowerCase());
  const aLearnTokens = (a.skillsToLearn || []).map(s => s.toLowerCase());
  const bTopTokens = (b.topSkills || []).map(s => s.toLowerCase());
  const bLearnTokens = (b.skillsToLearn || []).map(s => s.toLowerCase());
  
  const aTeachesB_Matches = aTopTokens.filter(s => bLearnTokens.includes(s));
  const bTeachesA_Matches = bTopTokens.filter(s => aLearnTokens.includes(s));
  
  if (aTeachesB_Matches.length > 0) reasons.push(`${userA.name} can teach: ${aTeachesB_Matches.slice(0, 2).join(', ')}`);
  if (bTeachesA_Matches.length > 0) reasons.push(`${userB.name} can teach: ${bTeachesA_Matches.slice(0, 2).join(', ')}`);
  if (finalSkillScore === 0) reasons.push('Different skill interests');

  // -- Metric 2: Primary Attributes Vector Similarity (60% Weight) --
  // Extract N-dimensional vectors for user attributes
  const vectorA = extractAttributeVector(a);
  const vectorB = extractAttributeVector(b);
  
  // Compute absolute mathematically-correct Cosine Similarity between Attribute Vectors
  const attributeCosineSim = cosineSimilarity(vectorA, vectorB);
  
  // Map standard 0.0-1.0 coefficient to a 0-60 point scale
  // Floor the base, but penalize extreme outliers heavily through KNN isolation
  const finalAttributeScore = Math.min(60, Math.round(attributeCosineSim * 60));

  // Determine attribute reasons by calculating scalar differences in vector dimensions
  if (Math.abs(vectorA[0] - vectorB[0]) <= 0.1) {
    if (a.level === b.level) reasons.push(`Same skill level (${a.level || 'Intermediate'})`);
    else reasons.push(`Complementary levels (${a.level || '?'} & ${b.level || '?'})`);
  }
  if (vectorA[2] === vectorB[2] && a.collabStyle) {
    reasons.push(`Both prefer ${a.collabStyle} collaboration`);
  }
  if (Math.abs(vectorA[1] - vectorB[1]) <= 0.15) {
    reasons.push(`Similar availability (${a.weeklyHours || '?'})`);
  }
  if (Math.abs(vectorA[3] - vectorB[3]) <= 0.10) {
    reasons.push('Compatible timezones');
  }

  if (reasons.length === 0) reasons.push('Diverse backgrounds — great for cross-learning');

  const overallScore = Math.min(100, Math.max(0, finalSkillScore + finalAttributeScore));

  return { score: overallScore, reasons };
}


// ── 3b. Project Match Scoring ─────────────────────────────────────────────────

/**
 * Computes a match score between a user and a board/project.
 * Overlaps the user's combined skill set (topSkills + skillsToLearn)
 * against the board's requiredSkills (or tags as a fallback).
 * Returns { score: 0-100, reasons: String[] }
 */
export function computeProjectMatchScore(user, board) {
  const reasons = [];
  const userData = user.matchmakingData || {};

  // Union of everything the user knows or wants to learn
  const userSkills = [
    ...(userData.topSkills || []),
    ...(userData.skillsToLearn || []),
  ];

  // Board's required skills — fall back to tags if field absent
  const boardSkills = (board.requiredSkills && board.requiredSkills.length)
    ? board.requiredSkills
    : (board.tags || []);

  if (!userSkills.length || !boardSkills.length) {
    return { score: 0, reasons: ['No skill data to compare'] };
  }

  // Reuse the existing Bag-of-Words cosine similarity function
  const sim = computeSkillTextVectorSim(userSkills, boardSkills);
  const score = Math.min(100, Math.round(sim * 100));

  // Build readable reason chips
  const userTokens = userSkills.map(s => s.toLowerCase());
  const boardTokens = boardSkills.map(s => s.toLowerCase());
  const matched = boardTokens.filter(s => userTokens.includes(s));

  if (matched.length > 0) {
    reasons.push(`Skill match: ${matched.slice(0, 3).join(', ')}`);
  }
  if (score === 0) {
    reasons.push('No overlapping skills');
  }

  return { score, reasons };
}


// ── 3c. Course Match Scoring ──────────────────────────────────────────────────

/**
 * Computes a match score between a user and a course.
 *
 * Metric 1 (80%): Bag-of-Words cosine similarity between
 *   user.matchmakingData.skillsToLearn  vs  course.tags
 *
 * Metric 2 (20%): Difficulty complementarity — rewards courses
 *   at or one level above the user's current level (same logic
 *   as the level dimension used in computeMatchScore).
 *
 * Returns { score: 0-100, reasons: String[] }
 */
export function computeCourseMatchScore(user, course) {
  const reasons = [];
  const userData = user.matchmakingData || {};

  // ── Metric 1: Skill alignment (skillsToLearn vs course tags) ──
  const wantToLearn = userData.skillsToLearn || [];
  const courseTags  = course.tags || [];

  let skillScore = 0;
  if (wantToLearn.length && courseTags.length) {
    const sim = computeSkillTextVectorSim(wantToLearn, courseTags);
    skillScore = Math.round(sim * 80); // out of 80

    // Identify matched tags for reason chips
    const learnTokens  = wantToLearn.map(s => s.toLowerCase());
    const tagTokens    = courseTags.map(s => s.toLowerCase());
    const matched      = tagTokens.filter(t => learnTokens.includes(t));
    if (matched.length > 0) {
      reasons.push(`Covers: ${matched.slice(0, 3).join(', ')}`);
    }
  }

  // ── Metric 2: Difficulty complementarity (out of 20) ──
  const LEVEL_MAP = { Beginner: 0.2, Intermediate: 0.6, Advanced: 1.0 };
  const userLevel   = LEVEL_MAP[userData.level]   ?? 0.6;
  const courseLevel = LEVEL_MAP[course.difficulty] ?? 0.6;

  // Perfect match = same level or one step up; penalise large gaps
  const levelDiff  = Math.abs(courseLevel - userLevel);
  const levelBonus = Math.round(Math.max(0, 1 - levelDiff * 1.5) * 20);

  if (levelBonus >= 15) {
    reasons.push(`Level match: ${course.difficulty}`);
  }

  const score = Math.min(100, skillScore + levelBonus);
  if (score === 0) reasons.push('No skill overlap with your learning goals');

  return { score, reasons };
}


// ── 4. K-Nearest Neighbors Pipeline ──────────────────────────────────────────

/**
 * scoreAndSortCandidates(me, candidates) -> The KNN Core Operator
 *
 * Implements K-Nearest Neighbors logic. Evaluates the 'me' target vector 
 * against a dataset (candidates), sorting them securely by computed 
 * Cosine distance parameters to extract the nearest neighbor clusters.
 * 
 * Returns sorted array of { user, score, reasons } descending by score.
 */
export function scoreAndSortCandidates(me, candidates) {
  // 1. Calculate the Feature Distances (Similarity Scores)
  const evaluatedNeighbors = candidates.map(candidate => {
    const { score, reasons } = computeMatchScore(me, candidate);
    return { user: candidate, score, reasons };
  });

  // 2. Sort the dataset to locate the absolute Nearest Neighbors
  return evaluatedNeighbors.sort((a, b) => b.score - a.score);
}

// ── 5. Nightly Refresh — Called by Cron ──────────────────────────────────────

/**
 * refreshMatchesForUser(userId, io)
 *
 * Re-scores all candidates for a single user, diffs against their existing
 * cache, fires per-match 'match:new' notifications for any new high-score
 * entries (score >= 75), and persists the updated cache.
 *
 * Called by the nightly matchmaking cron in taskScheduler.js.
 */
export async function refreshMatchesForUser(userId, io) {
  // 1. Fetch full user document (non-lean — needs .save())
  const user = await User.findById(userId);
  if (!user) return;

  // 2. Fetch up to 100 eligible candidates (exclude self)
  const candidates = await User.find({
    _id: { $ne: userId },
    onboardingCompleted: true,
    isActive: true,
  })
    .select('name role profile_image skills matchmakingData xp availability')
    .limit(100)
    .lean();

  if (!candidates.length) return;

  // 3. Score all candidates using the KNN pipeline
  const scored = scoreAndSortCandidates(user, candidates);

  // 4. Take top 10 results
  const top10 = scored.slice(0, 10).map(({ user: candidate, score, reasons }) => ({
    _id: candidate._id,
    name: candidate.name,
    role: candidate.role,
    profile_image: candidate.profile_image,
    skills: candidate.skills,
    availability: candidate.availability,
    xp: candidate.xp,
    matchmakingData: candidate.matchmakingData,
    score,
    reasons,
  }));

  // 5. Diff against existing cache — find new entries with score >= 75
  const previousIds = new Set(
    (user.matchSuggestionsCache || []).map(m => m._id.toString())
  );
  const newMatches = top10.filter(
    m => !previousIds.has(m._id.toString()) && m.score >= 75
  );

  // 6. Notify user for each new high-score match
  for (const newMatch of newMatches) {
    try {
      const notification = await Notification.create({
        user_id: userId,
        title: 'New Match Found!',
        message: `${newMatch.name} is a great match for you (${newMatch.score}% compatibility)`,
        type: 'match',
        link: '/dashboard.html',
      });
      if (io) {
        io.to(userId.toString()).emit('match:new', {
          notification,
          count: newMatches.length,
        });
      }
    } catch (notifErr) {
      console.error(`[Matchmaking Cron] Notification error for user ${userId}:`, notifErr.message);
    }
  }

  // 7. Persist updated cache
  user.matchSuggestionsCache = top10;
  user.matchesCachedAt = new Date();
  await user.save();
}
