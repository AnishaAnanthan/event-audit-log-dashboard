import express from "express";
import rateLimit from "express-rate-limit";
import { admin, protect } from "../middlewares/auth.middleware.js";
import { getInsightCards, getThreatSummary, queryAssistant, triageAlert } from "./ai.controller.js";

const router = express.Router();

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.AI_RATE_LIMIT_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ message: "Too many AI requests. Please try again shortly." });
  },
});

router.get("/threat-summary", aiLimiter, protect, admin, getThreatSummary);
router.post("/insight-cards", aiLimiter, protect, admin, getInsightCards);
router.post("/triage-alert/:alertId", aiLimiter, protect, triageAlert);
router.post("/query", aiLimiter, protect, queryAssistant);

export default router;
