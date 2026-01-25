// middleware/authMiddleware.js
import jwt from "jsonwebtoken";

import User from "../models/user.js";

export const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if user still exists and is active
    const userId = decoded.id || decoded._id || decoded.userId;
    const user = await User.findById(userId).select("isActive role"); // Fetch from DB

    if (!user) {
      return res.status(401).json({ message: "User not found." });
    }

    if (user.isActive === false) {
      return res.status(403).json({ message: "Account is deactivated. Please contact support." });
    }

    // Attach user to req
    req.user = {
      id: userId,
      role: user.role
    };
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token." });
  }
};


