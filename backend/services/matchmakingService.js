/**
 * SkillSprint — Matchmaking Scoring Service
 * ─────────────────────────────────────────
 * Computes a 0–100 compatibility score between two users using:
 *   40%  Skill complementarity (A teaches ↔ B learns, bidirectional)
 *   20%  Level complementarity (adjacent levels score highest)
 *   15%  Collaboration style match
 *   15%  Weekly hours proximity
 *   10%  Timezone proximity
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns UTC offset in hours for a given IANA timezone string.
 * Falls back to 0 on any error.
 */
function utcOffsetHours(ianaZone) {
  try {
    if (!ianaZone) return 0;
    // Use Intl to get the offset at a reference point
    const now = new Date();
    const utcMs = now.getTime();
    const local = new Date(now.toLocaleString('en-US', { timeZone: ianaZone }));
    const offsetMs = local.getTime() - utcMs;
    // This gives approximate offset in hours
    return offsetMs / (1000 * 3600);
  } catch {
    return 0;
  }
}

/** Normalize weekly-hours label to a numeric midpoint for comparison */
const HOURS_MAP = {
  '< 5hrs': 2.5,
  '< 5 hrs': 2.5,
  '5–10hrs': 7.5,
  '5-10hrs': 7.5,
  '5–10 hrs': 7.5,
  '10+ hrs': 12,
  '10+hrs': 12,
};

function hoursToNum(label) {
  if (!label) return 7.5; // default to middle
  return HOURS_MAP[label] ?? 7.5;
}

/** Level hierarchy for computing adjacency */
const LEVEL_ORDER = { Beginner: 0, Intermediate: 1, Advanced: 2 };

// ── Main scoring function ─────────────────────────────────────────────────────

/**
 * computeMatchScore(userA, userB)
 *
 * Both userA and userB should be plain objects with:
 *   matchmakingData: { level, topSkills[], skillsToLearn[], weeklyHours, collabStyle, timezone, mainGoal, projectRole }
 *
 * Returns: { score: Number (0–100), reasons: String[] }
 */
export function computeMatchScore(userA, userB) {
  const reasons = [];
  let total = 0;

  const a = userA.matchmakingData || {};
  const b = userB.matchmakingData || {};

  // ── 1. Skill Complementarity (40 pts) ─────────────────────────────────────
  // A knows → B wants to learn  +  B knows → A wants to learn
  const aTopSkillsLower  = (a.topSkills      || []).map(s => s.toLowerCase());
  const bTopSkillsLower  = (b.topSkills      || []).map(s => s.toLowerCase());
  const aLearnLower      = (a.skillsToLearn  || []).map(s => s.toLowerCase());
  const bLearnLower      = (b.skillsToLearn  || []).map(s => s.toLowerCase());

  // A can teach B
  const aTeachesB = aTopSkillsLower.filter(s => bLearnLower.includes(s));
  // B can teach A
  const bTeachesA = bTopSkillsLower.filter(s => aLearnLower.includes(s));

  const totalPossible = Math.max(1, aLearnLower.length + bLearnLower.length);
  const complementaryMatches = aTeachesB.length + bTeachesA.length;
  const skillScore = Math.min(40, Math.round((complementaryMatches / totalPossible) * 40));
  total += skillScore;

  if (aTeachesB.length > 0) reasons.push(`${userA.name} can teach: ${aTeachesB.slice(0, 2).join(', ')}`);
  if (bTeachesA.length > 0) reasons.push(`${userB.name} can teach: ${bTeachesA.slice(0, 2).join(', ')}`);
  if (skillScore === 0) reasons.push('Different skill interests');

  // ── 2. Level Complementarity (20 pts) ────────────────────────────────────
  // Adjacent levels (Begin↔Inter or Inter↔Adv): 20pts
  // Same level: 15pts (peers)
  // Two steps apart: 5pts
  const la = LEVEL_ORDER[a.level] ?? 1;
  const lb = LEVEL_ORDER[b.level] ?? 1;
  const levelDiff = Math.abs(la - lb);

  let levelScore = 0;
  if (levelDiff === 1) {
    levelScore = 20;
    reasons.push(`Complementary levels (${a.level || '?'} & ${b.level || '?'})`);
  } else if (levelDiff === 0) {
    levelScore = 15;
    reasons.push(`Same skill level (${a.level || 'Intermediate'})`);
  } else {
    levelScore = 5;
  }
  total += levelScore;

  // ── 3. Collab Style (15 pts) ──────────────────────────────────────────────
  // Exact match: 15pts. No match: 0
  const collabScore = (a.collabStyle && b.collabStyle && a.collabStyle === b.collabStyle) ? 15 : 0;
  total += collabScore;
  if (collabScore > 0) reasons.push(`Both prefer ${a.collabStyle} collaboration`);

  // ── 4. Weekly Hours Proximity (15 pts) ────────────────────────────────────
  const aHrs = hoursToNum(a.weeklyHours);
  const bHrs = hoursToNum(b.weeklyHours);
  const hoursDiff = Math.abs(aHrs - bHrs);
  let hoursScore = 0;
  if (hoursDiff <= 1)       hoursScore = 15;   // Same bucket
  else if (hoursDiff <= 5)  hoursScore = 10;   // 1 tier apart
  else                      hoursScore = 3;
  total += hoursScore;
  if (hoursScore >= 10) reasons.push(`Similar availability (${a.weeklyHours || '?'})`);

  // ── 5. Timezone Proximity (10 pts) ────────────────────────────────────────
  const tzA = utcOffsetHours(a.timezone);
  const tzB = utcOffsetHours(b.timezone);
  const tzDiff = Math.abs(tzA - tzB);
  let tzScore = 0;
  if (tzDiff <= 2)       tzScore = 10;
  else if (tzDiff <= 4)  tzScore = 7;
  else if (tzDiff <= 6)  tzScore = 4;
  else                   tzScore = 1;
  total += tzScore;
  if (tzScore >= 7) reasons.push('Compatible timezones');

  // ── Final ─────────────────────────────────────────────────────────────────
  const score = Math.min(100, Math.max(0, total));
  if (reasons.length === 0) reasons.push('Diverse backgrounds — great for cross-learning');

  return { score, reasons };
}

/**
 * scoreAndSortCandidates(me, candidates)
 *
 * me         — full User document (needs matchmakingData)
 * candidates — array of User lean objects
 *
 * Returns sorted array of { user, score, reasons } descending by score.
 */
export function scoreAndSortCandidates(me, candidates) {
  return candidates
    .map(candidate => {
      const { score, reasons } = computeMatchScore(me, candidate);
      return { user: candidate, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
}
