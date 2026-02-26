import express from "express";
import { protect, admin } from "../middlewares/auth.middleware.js";
import { exportEventsCsv, exportAlertsCsv } from "../controllers/export.controller.js";
import rateLimit from "express-rate-limit";
import { validateDateRangeQuery } from "../middlewares/validation.middleware.js";

const router = express.Router();

const exportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many export requests. Please try again in a minute." });
  },
});

router.get("/events", exportLimiter, protect, admin, validateDateRangeQuery, exportEventsCsv);
router.get("/alerts", exportLimiter, protect, admin, exportAlertsCsv);

export default router;
