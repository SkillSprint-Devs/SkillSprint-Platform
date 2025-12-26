import express from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import fs from "fs";
import Post from "../models/post.js";
import User from "../models/user.js";
import Follower from "../models/follower.js";
import Like from "../models/like.js";
import Comment from "../models/comment.js";
import Notification from "../models/notification.js";

const router = express.Router();

import { storage } from "../config/cloudinary.js";

// Multer config
const upload = multer({ storage });

// Verify token middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Access Denied" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(400).json({ message: "Invalid Token" });
  }
};

const getFollowerIds = async (userId) => {
  const followers = await Follower.find({ followingId: userId, status: "accepted" });
  return followers.map((f) => f.followerId.toString());
};

// CREATE POST
router.post("/posts", verifyToken, upload.array("media", 3), async (req, res) => {
  try {
    const { content } = req.body;
    const userId = req.user.id;
    const files = req.files || [];

    if (!content && files.length === 0) {
      return res.status(400).json({ message: "Post content or media required" });
    }

    const user = await User.findById(userId).select("name email avatarUrl position");
    if (!user) return res.status(404).json({ message: "User not found" });

    const media = (req.files || []).map((f) => ({
      url: f.path,
      type: f.mimetype,
    }));

    const newPost = new Post({
      authorId: userId,
      content,
      media,
      createdAt: new Date(),
      updatedAt: new Date(),
      likes: [],
    });

    await newPost.save();
    await newPost.populate("authorId", "name email avatarUrl position");

    // SOCKET emits
    try {
      const io = req.app.get("io");
      const followers = await Follower.find({ followingId: userId, status: "accepted" });
      const followerIds = followers.map((f) => f.followerId.toString());
      followerIds.forEach((fid) => io.to(fid).emit("postCreated", { post: newPost }));
      io.to(userId).emit("postCreated", { post: newPost });
      io.emit("postCreatedGlobal", { post: newPost });
    } catch (e) {
      console.error("Socket emit error (post create):", e);
    }


    res.status(201).json({ message: "Post created successfully", post: newPost });
  } catch (error) {
    console.error("Create Post Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// READ ALL POSTS
router.get("/posts", verifyToken, async (req, res) => {
  try {
    const posts = await Post.find()
      .populate("authorId", "name email avatarUrl position")
      .lean();


    for (let post of posts) {
      post.likesCount = Array.isArray(post.likes) ? post.likes.length : 0;
      post.commentsCount = await Comment.countDocuments({ postId: post._id });

    }

    res.json(posts);
  } catch (error) {
    console.error("Read Posts Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// READ USER'S OWN POSTS
router.get("/posts/mine", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const userPosts = await Post.find({ authorId: userId })
      .populate("authorId", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json(userPosts);
  } catch (error) {
    console.error("User Posts Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// UPDATE POST (only author, within 30 minutes)
router.put("/posts/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { content, imageUrl } = req.body;
    const userId = req.user.id;

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    if (post.authorId.toString() !== userId) {
      return res.status(403).json({ message: "Unauthorized: You can only update your own posts" });
    }

    const timeElapsed = Date.now() - new Date(post.createdAt).getTime();
    const thirtyMinutes = 30 * 60 * 1000;

    if (timeElapsed > thirtyMinutes) {
      return res.status(400).json({ message: "Update window expired. You can only edit within 30 minutes of posting." });
    }

    post.content = content || post.content;
    post.imageUrl = imageUrl || post.imageUrl;
    post.updatedAt = new Date();

    await post.save();

    // Socket emit
    try {
      const io = req.app.get("io");
      const followerIds = await getFollowerIds(userId);
      followerIds.forEach((fid) => io.to(fid).emit("postUpdated", { post }));
      io.to(userId).emit("postUpdated", { post });
      io.emit("postUpdatedGlobal", { post });
    } catch (e) {
      console.error("Socket emit error (post update):", e);
    }

    // return updated post 
    res.json({ message: "Post updated successfully", post });
  } catch (error) {
    console.error("Update Post Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// DELETE POST
router.delete("/posts/:id", verifyToken, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    if (post.authorId.toString() !== userId) {
      return res.status(403).json({ message: "You can only delete your own posts" });
    }

    await Post.findByIdAndDelete(postId);

    await Like.deleteMany({ postId });
    await Comment.deleteMany({ postId });

    // Socket emits
    try {
      const io = req.app.get("io");
      const followerIds = await getFollowerIds(userId);
      followerIds.forEach((fid) => io.to(fid).emit("postDeleted", { postId }));
      io.to(userId).emit("postDeleted", { postId });
      io.emit("postDeletedGlobal", { postId });
    } catch (e) {
      console.error("Socket emit error (post delete):", e);
    }

    res.status(200).json({ message: "Post deleted successfully" });
  } catch (error) {
    console.error("Delete Post Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// LIKE toggle (keeps Post.likes array AND Like collection in sync)
router.post("/:id/like", verifyToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const userId = req.user.id;
    if (!Array.isArray(post.likes)) post.likes = [];

    const alreadyLiked = post.likes.map(id => id.toString()).includes(userId);

    if (alreadyLiked) {
      // unlike in post.likes
      post.likes = post.likes.filter(id => id.toString() !== userId);
      // remove from Like collection as well
      await Like.findOneAndDelete({ postId: post._id.toString(), userId });
    } else {
      // like
      post.likes.push(userId);
      // ensure Like collection has an entry
      const existing = await Like.findOne({ postId: post._id.toString(), userId });
      if (!existing) {
        const l = new Like({ postId: post._id.toString(), userId });
        await l.save();
      }

      // Create notification for post author (only on like, not unlike)
      if (post.authorId.toString() !== userId) {
        try {
          const liker = await User.findById(userId).select("name");
          const notification = new Notification({
            user_id: post.authorId,
            title: "New Like",
            message: `${liker?.name || 'Someone'} liked your post`,
            type: "general",
            link: `/posting`,
          });
          await notification.save();

          const io = req.app.get("io");
          if (io) {
            io.to(post.authorId.toString()).emit("notification", notification);
          }
        } catch (notifErr) {
          console.error("Failed to create like notification:", notifErr);
        }
      }
    }

    await post.save();

    // emit via socket
    try {
      const io = req.app.get("io");
      const payload = { postId: post._id.toString(), likesCount: post.likes.length };

      if (alreadyLiked) {
        io.to(post.authorId.toString()).emit("postUnliked", payload);
        io.emit("postUnliked", payload);
      } else {
        io.to(post.authorId.toString()).emit("postLiked", payload);
        io.emit("postLiked", payload);
      }
    } catch (e) {
      console.error("Socket emit error (like toggle):", e);
    }

    res.json({
      likesCount: post.likes.length,
      liked: !alreadyLiked
    });
  } catch (err) {
    console.error("Like toggle error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// UNLIKE via explicit route (keeps Like collection and Post.likes consistent)
router.delete("/posts/:postId/unlike", verifyToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;


    const like = await Like.findOneAndDelete({ postId, userId });


    const post = await Post.findById(postId);
    if (post && Array.isArray(post.likes)) {
      post.likes = post.likes.filter(id => id.toString() !== userId);
      await post.save();
    }

    // socket emits 
    try {
      const io = req.app.get("io");
      if (post) {
        io.to(post.authorId.toString()).emit("postUnliked", { postId, userId });
      }
      io.to(userId).emit("postUnlikedByYou", { postId });

      const unlikerFollowerIds = await getFollowerIds(userId);
      unlikerFollowerIds.forEach(fid => io.to(fid).emit("postUnliked", { actorId: userId, postId }));

      io.emit("postUnlikedGlobal", { postId, userId });
    } catch (e) {
      console.error("Socket emit error (unlike):", e);
    }

    res.status(200).json({ message: "Post unliked successfully" });
  } catch (error) {
    console.error("Unlike Post Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// GET likes count for a post 
router.get("/posts/:postId/likes", verifyToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const post = await Post.findById(postId).lean();
    if (!post) return res.status(404).json({ message: "Post not found" });
    const totalLikes = Array.isArray(post.likes) ? post.likes.length : 0;
    res.status(200).json({ postId, totalLikes });
  } catch (error) {
    console.error("Get Likes Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// GET users who liked a post 
router.get("/posts/:postId/likes/users", verifyToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const post = await Post.findById(postId).lean();
    if (!post) return res.status(404).json({ message: "Post not found" });

    const userIds = Array.isArray(post.likes) ? post.likes : [];
    const users = await User.find({ _id: { $in: userIds } }).select("name email profile_image");
    res.status(200).json({ postId, likedBy: users });
  } catch (error) {
    console.error("Get Liked Users Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

//  COMMENTS 
router.post("/posts/:postId/comments", verifyToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const { text } = req.body;
    const userId = req.user.id;

    if (!text) return res.status(400).json({ message: "Comment text is required" });

    const newComment = new Comment({
      postId,
      userId,
      text,
      createdAt: new Date(),
    });

    await newComment.save();

    // Create notification for post author
    try {
      const post = await Post.findById(postId);
      if (post && post.authorId.toString() !== userId) {
        const commenter = await User.findById(userId).select("name");
        const notification = new Notification({
          user_id: post.authorId,
          title: "New Comment",
          message: `${commenter?.name || 'Someone'} commented on your post`,
          type: "general",
          link: `/posting`,
        });
        await notification.save();

        const io = req.app.get("io");
        if (io) {
          io.to(post.authorId.toString()).emit("notification", notification);
        }
      }
    } catch (notifErr) {
      console.error("Failed to create comment notification:", notifErr);
    }

    try {
      const io = req.app.get("io");
      const post = await Post.findById(postId);
      if (post) io.to(post.authorId.toString()).emit("commentCreated", { postId, comment: newComment });
      io.to(userId).emit("commentCreatedByYou", { postId, comment: newComment });

      const commenterFollowerIds = await getFollowerIds(userId);
      commenterFollowerIds.forEach(fid => io.to(fid).emit("commentCreated", { actorId: userId, postId, comment: newComment }));

      io.emit("commentCreatedGlobal", { postId, comment: newComment });
    } catch (e) {
      console.error("Socket emit error (comment create):", e);
    }

    res.status(201).json({ message: "Comment added successfully", comment: newComment });
  } catch (error) {
    console.error("Create Comment Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});


router.get("/posts/:postId/comments", verifyToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const comments = await Comment.find({ postId })
      .populate("userId", "name email profile_image")
      .sort({ createdAt: -1 });

    res.status(200).json({
      message: "Comments fetched successfully",
      totalComments: comments.length,
      comments,
    });
  } catch (error) {
    console.error("Get Comments Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

router.get("/posts", verifyToken, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const posts = await Post.find()
      .populate("authorId", "name email profile_image role followers following")
      .lean();


    const cur = await User.findById(currentUserId).select("following").lean();
    const followingSet = new Set((cur?.following || []).map(String));

    for (let post of posts) {
      post.likesCount = Array.isArray(post.likes) ? post.likes.length : 0;
      post.commentsCount = await Comment.countDocuments({ postId: post._id });
      post.isLiked = Array.isArray(post.likes) && post.likes.map(String).includes(String(currentUserId));

      const authorId = post.authorId?._id || post.authorId;
      post.authorId.isFollowing = followingSet.has(String(authorId));
    }

    res.json(posts);
  } catch (error) {
    console.error("Read Posts Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});


//  FOLLOW / UNFOLLOW / SUGGESTIONS 


const safeArray = (v) => (Array.isArray(v) ? v : []);

// FOLLOW
router.post("/follow/:id", verifyToken, async (req, res) => {
  try {
    const targetId = req.params.id;
    const userId = req.user.id;

    if (userId === targetId)
      return res.status(400).json({ message: "You can't follow yourself" });

    const user = await User.findById(userId);
    const target = await User.findById(targetId);
    if (!user || !target)
      return res.status(404).json({ message: "User not found" });

    if (!user.following.includes(targetId)) user.following.push(targetId);
    if (!target.followers.includes(userId)) target.followers.push(userId);

    await user.save();
    await target.save();

    // Create notification for followed user
    try {
      const notification = new Notification({
        user_id: targetId,
        title: "New Follower",
        message: `${user.name || 'Someone'} started following you`,
        type: "general",
        link: `/profile/${userId}`,
      });
      await notification.save();

      const io = req.app.get("io");
      if (io) {
        io.to(targetId.toString()).emit("notification", notification);
      }
    } catch (notifErr) {
      console.error("Failed to create follow notification:", notifErr);
    }

    const updatedUser = await User.findById(userId).select("name profile_image following followers following_count followers_count");
    const updatedTarget = await User.findById(targetId).select("name profile_image following followers following_count followers_count");

    // emit socket events
    try {
      const io = req.app.get("io");
      io.to(targetId).emit("followAccepted", { followerId: userId, followingId: targetId });
      io.to(userId).emit("followingUpdated", { followerId: userId, followingId: targetId });
      io.emit("followingUpdated", { followerId: userId, followingId: targetId });
    } catch (e) {
      console.error("Socket emit error (follow):", e);
    }

    return res.json({
      message: "Followed successfully",
      follower: updatedUser,
      following: updatedTarget,
      followingCount: updatedUser.following_count,
      followersCount: updatedUser.followers_count,
    });
  } catch (err) {
    console.error("Follow error:", err);
    res.status(500).json({ message: "Follow failed", error: err.message });
  }
});


// UNFOLLOW
router.delete("/unfollow/:id", verifyToken, async (req, res) => {
  try {
    const targetId = req.params.id;
    const userId = req.user.id;

    if (userId === targetId)
      return res.status(400).json({ message: "You can't unfollow yourself" });

    const user = await User.findById(userId);
    const target = await User.findById(targetId);
    if (!user || !target)
      return res.status(404).json({ message: "User not found" });

    user.following = user.following.filter((id) => id.toString() !== targetId);
    target.followers = target.followers.filter((id) => id.toString() !== userId);

    await user.save();
    await target.save();

    const updatedUser = await User.findById(userId).select("name profile_image following followers following_count followers_count");

    try {
      const io = req.app.get("io");
      io.to(targetId).emit("unfollowed", { followerId: userId, followingId: targetId });
      io.to(userId).emit("followingUpdated", { followerId: userId, followingId: targetId });
      io.emit("followingUpdated", { followerId: userId, followingId: targetId });
    } catch (e) {
      console.error("Socket emit error (unfollow):", e);
    }

    return res.json({
      message: "Unfollowed successfully",
      followingCount: updatedUser.following_count,
      followersCount: updatedUser.followers_count,
    });
  } catch (err) {
    console.error("Unfollow error:", err);
    res.status(500).json({ message: "Unfollow failed", error: err.message });
  }
});


//  FOLLOWERS & FOLLOWING LISTS 

// Get followers of a user
router.get("/followers/:id", verifyToken, async (req, res) => {
  try {
    const targetId = req.params.id;
    const user = await User.findById(targetId).select("followers").lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    const followers = await User.find({ _id: { $in: user.followers || [] } })
      .select("name role profile_image")
      .lean();

    res.json(followers);
  } catch (err) {
    console.error("Followers fetch error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Get following list of a user
router.get("/following/:id", verifyToken, async (req, res) => {
  try {
    const targetId = req.params.id;
    const user = await User.findById(targetId).select("following").lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    const following = await User.find({ _id: { $in: user.following || [] } })
      .select("name role profile_image")
      .lean();

    res.json(following);
  } catch (err) {
    console.error("Following fetch error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ======== SUGGESTIONS (users you don't follow yet) =========
router.get("/suggestions", verifyToken, async (req, res) => {
  try {
    const me = await User.findById(req.user.id).select("following");
    if (!me) return res.status(404).json({ message: "User not found" });

    const suggestions = await User.find({
      _id: { $ne: req.user.id, $nin: me.following },
    })
      .select("name role profile_image followers following")
      .limit(10)
      .lean();

    res.json(suggestions);
  } catch (err) {
    console.error("Suggestions fetch error:", err);
    res.status(500).json({ message: "Failed to load suggestions" });
  }
});


// ========== CHAT LIST (users you can message) ==========
router.get("/chatList", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select("following").lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    const followingIds = Array.isArray(user.following) ? user.following : [];
    if (followingIds.length === 0)
      return res.json([]);

    const chatUsers = await User.find({ _id: { $in: followingIds } })
      .select("name role profile_image")
      .lean();

    res.json(chatUsers);
  } catch (err) {
    console.error("Chat list fetch error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;

