/**
 * cleanupService.js
 * Centralized logic for hard-deleting user data and orphaned projects.
 */

import User from '../models/user.js';
import Board from '../models/board.js';
import PairProgramming from '../models/pair-programming.js';
import Task from '../models/task.js';
import Library from '../models/library.js';
import Post from '../models/post.js';
import Achievement from '../models/achievement.js';
import Notification from '../models/notification.js';
import Chat from '../models/chat.js';
import Invitation from '../models/Invitation.js';
import QuizAttempt from '../models/quizAttempt.js';
import Certificate from '../models/certificate.js';
import Reminder from '../models/reminder.js';
import Wallet from '../models/wallet.js';
import WalletTransaction from '../models/walletTransaction.js';
import ActivityLog from '../models/activityLog.js';
import Follower from '../models/follower.js';
import Like from '../models/like.js';
import Comment from '../models/comment.js';
import Otp from '../models/otp.js';

/**
 * Performs a TOTAL HARD DELETE of a user and every single piece of data they created.
 * Also notifies members of projects they owned before deletion.
 */
export async function hardDeleteUserData(userId, io = null) {
  try {
    const user = await User.findById(userId).lean();
    if (!user) return { success: false, message: 'User not found' };

    const userEmail = user.email;

    // 1. Fetch projects OWNED by this user to notify members
    const ownedBoards = await Board.find({ owner: userId }).select('name members').lean();
    const ownedPairs  = await PairProgramming.find({ owner: userId }).select('name members').lean();

    const notifyMembers = async (projects, type) => {
      for (const p of projects) {
        const memberIds = (p.members || []).map(m => m.user ? m.user.toString() : m.toString()).filter(id => id !== userId.toString());
        
        for (const mId of memberIds) {
          try {
            const notif = await Notification.create({
              user_id: mId,
              title: 'Project Deleted',
              message: `The ${type} "${p.name}" has been removed because the owner deleted their account.`,
              type: 'reminder',
              link: '/dashboard'
            });
            if (io) io.to(mId).emit('notification', notif);
          } catch (err) {
            console.error(`[Cleanup] Failed to notify member ${mId} for project ${p._id}:`, err.message);
          }
        }
      }
    };

    await notifyMembers(ownedBoards, 'Whiteboard');
    await notifyMembers(ownedPairs, 'Pair Programming project');

    // 2. Cascade Deletion (Parallel)
    await Promise.all([
      // Primary Content
      Board.deleteMany({ owner: userId }),
      PairProgramming.deleteMany({ owner: userId }),
      Task.deleteMany({ user: userId }),
      Library.deleteMany({ user_id: userId }),
      Post.deleteMany({ authorId: userId }),

      // Gamification & Progress
      Achievement.deleteMany({ user: userId }),
      QuizAttempt.deleteMany({ userId: userId }),
      Certificate.deleteMany({ userId: userId }),

      // Social & Interactions
      Comment.deleteMany({ authorId: userId }),
      Like.deleteMany({ userId: userId }),
      Follower.deleteMany({ $or: [{ follower: userId }, { following: userId }] }),
      Chat.deleteMany({ $or: [{ sender: userId }, { recipient: userId }] }),
      Invitation.deleteMany({ $or: [{ sender: userId }, { recipient: userId }] }),
      Notification.deleteMany({ user_id: userId }),
      ActivityLog.deleteMany({ userId: userId }),

      // Meta & Auth
      Reminder.deleteMany({ user: userId }),
      Otp.deleteMany({ email: userEmail }),

      // Financial
      Wallet.deleteOne({ user_id: userId }),
      WalletTransaction.deleteMany({ user_id: userId }),

      // Remove user from other projects' member lists
      Board.updateMany(
        { members: userId }, 
        { $pull: { members: userId, "permissions.editors": userId, "permissions.commenters": userId, "permissions.viewers": userId } }
      ),
      PairProgramming.updateMany(
        { "members.user": userId },
        { 
          $pull: { 
            members: { user: userId }, 
            "permissions.editors": userId, 
            "permissions.commenters": userId, 
            "permissions.viewers": userId 
          } 
        }
      ),

      // Cleanup user references in other users' following/followers arrays (if double-tracked)
      User.updateMany(
        { $or: [{ followers: userId }, { following: userId }] },
        { $pull: { followers: userId, following: userId } }
      )
    ]);

    // 3. Finally delete the user document
    await User.findByIdAndDelete(userId);

    console.log(`[Cleanup] Successfully hard-deleted all data for user: ${userId} (${userEmail})`);
    return { success: true };
  } catch (err) {
    console.error(`[Cleanup] Error during hard delete for user ${userId}:`, err);
    throw err;
  }
}

/**
 * Periodically cleans up orphaned projects (no owner or inactive owner).
 */
export async function cleanupOrphanedProjects(io = null) {
  try {
    console.log('[Cleanup] Starting orphaned projects check...');
    
    // Find all boards/pairs
    const boards = await Board.find({}).select('owner name members').lean();
    const pairs  = await PairProgramming.find({}).select('owner name members').lean();

    const allProjects = [
      ...boards.map(b => ({ ...b, type: 'Board' })),
      ...pairs.map(p => ({ ...p, type: 'PairProgramming' }))
    ];

    let deletedCount = 0;

    for (const p of allProjects) {
      const owner = await User.findById(p.owner).select('isActive').lean();
      
      if (!owner || owner.isActive === false) {
        console.log(`[Cleanup] Found orphaned project: ${p.name} (${p.type}). Owner: ${p.owner} (Missing or Inactive)`);
        
        // Notify members before deletion if possible
        const memberIds = (p.members || []).map(m => m.user ? m.user.toString() : m.toString()).filter(id => id !== (p.owner ? p.owner.toString() : ''));
        
        for (const mId of memberIds) {
          try {
            const notif = await Notification.create({
              user_id: mId,
              title: 'Project Removed',
              message: `The project "${p.name}" was removed due to owner account status.`,
              type: 'reminder',
              link: '/dashboard'
            });
            if (io) io.to(mId).emit('notification', notif);
          } catch (e) {}
        }

        // Delete the project
        if (p.type === 'Board') {
          await Board.findByIdAndDelete(p._id);
        } else {
          await PairProgramming.findByIdAndDelete(p._id);
        }
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`[Cleanup] Finished. Deleted ${deletedCount} orphaned projects.`);
    } else {
      console.log('[Cleanup] No orphaned projects found.');
    }
  } catch (err) {
    console.error('[Cleanup] Error during orphaned projects cleanup:', err);
  }
}
