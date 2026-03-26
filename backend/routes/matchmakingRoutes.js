/**
 * SkillSprint — Matchmaking Routes
 * POST /api/matchmaking/suggestions    - cached scored match list
 * PATCH /api/matchmaking/preferences   - update matchmakingData
 * POST /api/matchmaking/invalidate     - bust own cache (after pref change)
 */

import express from 'express';
import User from '../models/user.js';
import Board from '../models/board.js';
import Course from '../models/course.js';
import Notification from '../models/notification.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { scoreAndSortCandidates, computeProjectMatchScore, computeCourseMatchScore } from '../services/matchmakingService.js';

const router = express.Router();

// Cache TTL: 1 hour
const CACHE_TTL_MS = 60 * 60 * 1000;

// ── GET /api/matchmaking/suggestions ─────────────────────────────────────────
router.get('/suggestions', verifyToken, async (req, res) => {
  try {
    const meId = req.user.id;
    const me = await User.findById(meId).lean();
    if (!me) return res.status(404).json({ message: 'User not found' });

    // --- Cache hit? ---
    const cacheAge = me.matchesCachedAt ? Date.now() - new Date(me.matchesCachedAt).getTime() : Infinity;
    if (me.matchSuggestionsCache && cacheAge < CACHE_TTL_MS) {
      return res.json({ suggestions: me.matchSuggestionsCache, fromCache: true });
    }

    // --- Build fresh suggestions ---
    // Exclude self + people the user is already following
    const excludeIds = [meId, ...(me.following || []).map(String)];

    // Fetch up to 100 candidates who have completed onboarding
    const candidates = await User.find({
      _id: { $nin: excludeIds },
      onboardingCompleted: true,
      isActive: true,
    })
      .select('name role profile_image skills matchmakingData xp availability')
      .limit(100)
      .lean();

    if (!candidates.length || !me.onboardingCompleted) {
      // Fallback for cold start
      const randomUsers = await User.aggregate([
        { $match: { _id: { $ne: me._id }, isActive: true } },
        { $sample: { size: 5 } },
        { $project: { _id: 1, name: 1, role: 1, profile_image: 1, skills: 1, availability: 1, xp: 1, matchmakingData: 1 } }
      ]);
      const suggestions = randomUsers.map(user => ({
        ...user,
        score: 0,
        reasons: ['New to the platform'],
      }));
      return res.json({ suggestions, fromCache: false, coldStart: true });
    }

    // Score and sort
    const scored = scoreAndSortCandidates(me, candidates);

    // Take top 10
    const top10 = scored.slice(0, 10).map(({ user, score, reasons }) => ({
      _id: user._id,
      name: user.name,
      role: user.role,
      profile_image: user.profile_image,
      skills: user.skills,
      availability: user.availability,
      xp: user.xp,
      matchmakingData: user.matchmakingData,
      score,
      reasons,
    }));

    // --- Detect new matches ---
    const oldCacheIds = new Set((me.matchSuggestionsCache || []).map(m => m._id.toString()));
    const newMatches = top10.filter(m => !oldCacheIds.has(m._id.toString()));

    // --- Persist cache on user doc ---
    await User.findByIdAndUpdate(meId, {
      matchSuggestionsCache: top10,
      matchesCachedAt: new Date(),
    });

    // --- Emit real-time "match:new" notification for new matches ---
    try {
      if (newMatches.length > 0) {
        const isFirstTime = !me.matchesCachedAt;
        const io = req.app.get('io');
        const notif = await Notification.create({
          user_id: meId,
          title: isFirstTime ? 'Your Best Matches Are Ready!' : 'New Match Suggestions!',
          message: isFirstTime 
            ? `We found ${newMatches.length} great match${newMatches.length !== 1 ? 'es' : ''} based on your skills and goals.`
            : `We found ${newMatches.length} new match${newMatches.length !== 1 ? 'es' : ''} for you.`,
          type: 'match',
          link: '/dashboard.html',
        });
        if (io) io.to(meId).emit('match:new', { notification: notif, count: newMatches.length });
      }
    } catch (notifErr) {
      console.error('[Matchmaking] Notification error (non-fatal):', notifErr.message);
    }

    res.json({ suggestions: top10, fromCache: false });
  } catch (err) {
    console.error('[Matchmaking] Suggestions error:', err);
    res.status(500).json({ message: 'Failed to load match suggestions', error: err.message });
  }
});


// ── PATCH /api/matchmaking/preferences ───────────────────────────────────────
// Updates matchmakingData fields and busts the cache so next fetch re-scores
router.patch('/preferences', verifyToken, async (req, res) => {
  try {
    const { matchmakingData } = req.body;
    if (!matchmakingData) return res.status(400).json({ message: 'matchmakingData required' });

    const allowed = ['level', 'topSkills', 'skillsToLearn', 'weeklyHours', 'collabStyle', 'timezone', 'mainGoal', 'projectRole'];
    const update = {};
    for (const key of allowed) {
      if (matchmakingData[key] !== undefined) {
        update[`matchmakingData.${key}`] = matchmakingData[key];
      }
    }

    // Always bust cache on preference change
    update.matchSuggestionsCache = null;
    update.matchesCachedAt = null;

    const user = await User.findByIdAndUpdate(req.user.id, { $set: update }, { new: true })
      .select('matchmakingData matchesCachedAt')
      .lean();

    res.json({ message: 'Preferences updated. Suggestions will refresh on next load.', matchmakingData: user.matchmakingData });
  } catch (err) {
    console.error('[Matchmaking] Preferences update error:', err);
    res.status(500).json({ message: 'Failed to update preferences', error: err.message });
  }
});


// ── POST /api/matchmaking/invalidate ─────────────────────────────────────────
// Manually busts the suggestion cache (used after onboarding re-run)
router.post('/invalidate', verifyToken, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, {
      matchSuggestionsCache: null,
      matchesCachedAt: null,
    });
    res.json({ message: 'Match cache cleared. Next fetch will recompute.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to invalidate cache', error: err.message });
  }
});


// ── GET /api/matchmaking/projects ─────────────────────────────────────────────
// Returns top 5 boards scored by skill overlap with the requesting user
router.get('/projects', verifyToken, async (req, res) => {
  try {
    const meId = req.user.id;
    const me = await User.findById(meId).lean();
    if (!me) return res.status(404).json({ message: 'User not found' });

    // Fetch up to 50 boards to score for project matching
    const boards = await Board.find({})
      .select('_id name description requiredSkills members owner')
      .limit(50)
      .lean();

    if (!boards.length) {
      return res.json({ projects: [] });
    }

    // Score each board against the requesting user
    const scored = boards
      .map(board => {
        const { score, reasons } = computeProjectMatchScore(me, board);
        return {
          _id: board._id,
          title: board.name,
          description: board.description || '',
          requiredSkills: board.requiredSkills || [],
          memberCount: (board.members || []).length,
          score,
          reasons,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    res.json({ projects: scored });
  } catch (err) {
    console.error('[Matchmaking] Projects error:', err);
    res.status(500).json({ message: 'Failed to load project matches', error: err.message });
  }
});


// ── GET /api/matchmaking/courses ──────────────────────────────────────────────
// Returns top 5 courses scored by skillsToLearn alignment + difficulty match
router.get('/courses', verifyToken, async (req, res) => {
  try {
    const meId = req.user.id;
    const me = await User.findById(meId).lean();
    if (!me) return res.status(404).json({ message: 'User not found' });

    // Fetch all courses (collection expected to be small)
    const courses = await Course.find({}).lean();

    if (!courses.length) {
      return res.json({ courses: [] });
    }

    // Score each course against the requesting user
    const scored = courses
      .map(course => {
        const { score, reasons } = computeCourseMatchScore(me, course);
        return {
          _id:         course._id,
          title:       course.title,
          description: course.description || '',
          tags:        course.tags || [],
          difficulty:  course.difficulty || 'Beginner',
          link:        course.link || '',
          score,
          reasons,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    res.json({ courses: scored });
  } catch (err) {
    console.error('[Matchmaking] Courses error:', err);
    res.status(500).json({ message: 'Failed to load course matches', error: err.message });
  }
});

export default router;


