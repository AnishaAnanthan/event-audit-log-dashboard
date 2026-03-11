import express from "express";
import rateLimit from "express-rate-limit";
import { resendOtp, verifyEmail } from "./emailVerification.controller.js";

// Same defaults as the original implementation.
const otpLimiter = rateLimit({
  windowMs: Number(process.env.OTP_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000), // 10 minutes
  max: Number(process.env.OTP_RATE_LIMIT_MAX || 3), // 3 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many OTP requests. Please try again later." });
  },
});

const router = express.Router();

router.post("/verify-email", otpLimiter, verifyEmail);
router.post("/resend-otp", otpLimiter, resendOtp);

export default router;

