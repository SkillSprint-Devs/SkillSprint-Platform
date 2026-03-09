/**
 * SkillSprint — Matchmaking Routes
 * POST /api/matchmaking/suggestions    - cached scored match list
 * PATCH /api/matchmaking/preferences   - update matchmakingData
 * POST /api/matchmaking/invalidate     - bust own cache (after pref change)
 */

import express from 'express';
import User from '../models/user.js';
import Notification from '../models/notification.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { scoreAndSortCandidates } from '../services/matchmakingService.js';

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

    if (!candidates.length) {
      return res.json({ suggestions: [], fromCache: false });
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

    // --- Persist cache on user doc ---
    await User.findByIdAndUpdate(meId, {
      matchSuggestionsCache: top10,
      matchesCachedAt: new Date(),
    });

    // --- Emit real-time "match:new" notification if this is the very first time ---
    try {
      if (!me.matchesCachedAt && top10.length > 0) {
        const io = req.app.get('io');
        const notif = await Notification.create({
          user_id: meId,
          title: 'Your Best Matches Are Ready!',
          message: `We found ${top10.length} great match${top10.length !== 1 ? 'es' : ''} based on your skills and goals.`,
          type: 'match',
          link: '/dashboard.html',
        });
        if (io) io.to(meId).emit('match:new', { notification: notif, count: top10.length });
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

export default router;
