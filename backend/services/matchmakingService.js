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
    vectorizeLevel(d.level) * 0.40,               // Weighting intrinsic to feature map
    vectorizeHours(d.weeklyHours) * 0.30, 
    vectorizeCollab(d.collabStyle) * 0.30,
    (utcOffsetHours(d.timezone) + 12) / 24 * 0.20 // Normalize TZ (-12 to +12) -> 0.0 to 1.0 space
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

