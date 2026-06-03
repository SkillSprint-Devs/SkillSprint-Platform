import express from "express";
import fetch from "node-fetch"; // Node 18 has native fetch, but we can use the global fetch

const router = express.Router();

const AI_ENGINE_URL = process.env.AI_ENGINE_URL || "http://127.0.0.0:5050";
// Wait, typically it's http://127.0.0.1:5050 locally or http://ai-engine:5050 in docker.

router.post("/predict", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const aiEngineUrl = process.env.AI_ENGINE_URL || "http://localhost:5050";
    const response = await fetch(`${aiEngineUrl}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
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
