// middleware/authMiddleware.js
import jwt from "jsonwebtoken";

export const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  try {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  // If token payload has user id under _id, assign to id:
  req.user = {
    id: decoded.id || decoded._id || decoded.userId  // whatever key your token uses
  };
  next();
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token." });
  }
};


