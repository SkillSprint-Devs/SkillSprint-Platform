import express from "express";
import rateLimit from "express-rate-limit";
import { verifyToken } from "../middleware/authMiddleware.js";
import User from "../models/user.js";

const router = express.Router();

const aiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // limit each IP to 20 requests per windowMs
  message: { error: "Too many requests to the AI Mentor, please try again later.", intent: "error", response: "Too many requests. Please try again later.", confidence: 0 }
});

const AI_ENGINE_URL = process.env.AI_ENGINE_URL || "http://127.0.0.1:5050";

router.post("/predict", verifyToken, aiLimiter, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Query MongoDB for the user's actual name
    let username = null;
    if (req.user && req.user.id) {
      try {
        const user = await User.findById(req.user.id).select("name");
        if (user) {
          username = user.name;
        }
      } catch (err) {
        console.error("[AI Route] User DB lookup failed:", err);
      }
    }

    const aiEngineUrl = process.env.AI_ENGINE_URL || "http://localhost:5050";
    
    // Merge database-resolved username into context sent to Python
    const context = {
      username: username,
      ...(req.body.context || {})
    };

    const response = await fetch(`${aiEngineUrl}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, context }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI Engine responded with ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("[AI Route] Prediction failed:", error);
    res.status(503).json({ 
      error: "AI Engine unavailable", 
      intent: "fallback",
      response: "The AI Mentor is currently offline or unreachable. Please try again later.",
      confidence: 0
    });
  }
});

router.post("/feedback", async (req, res) => {
  try {
    const aiEngineUrl = process.env.AI_ENGINE_URL || "http://localhost:5050";
    const response = await fetch(`${aiEngineUrl}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    
    if (!response.ok) {
      throw new Error(`AI Engine responded with ${response.status}`);
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("[AI Route] Feedback logging failed:", error);
    res.status(503).json({ error: "Failed to log feedback" });
  }
});

export default router;
