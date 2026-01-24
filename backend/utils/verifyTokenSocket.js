// backend/utils/verifyTokenSocket.js
import jwt from "jsonwebtoken";

export const verifyTokenSocket = (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      console.log("Socket Auth Failed: No Token");
      return next(new Error("Authentication error"));
    }

    const secret = process.env.JWT_SECRET || process.env.TOKEN_SECRET;
    if (!secret) {
      console.error("No JWT secret found in environment");
      return next(new Error("Server configuration error"));
    }

    const decoded = jwt.verify(token, secret);
    socket.user = {
      id: decoded.id || decoded._id || decoded.userId
    };
    console.log("Socket authenticated for user:", socket.user.id);

    next();

  } catch (err) {
    console.log("Socket Auth Failed:", err.message);
    next(new Error("Authentication error"));
  }
};
