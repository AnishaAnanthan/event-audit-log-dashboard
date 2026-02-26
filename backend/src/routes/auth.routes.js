import express from "express";
import {
  register,
  login,
  logout,
  googleLogin,
  adminGoogleLogin,
  changePassword,
  updateSettings,
  deleteAccount,
  adminRegister,
  adminLogin,
  getAdminUsers,
  getAdminUserById,
} from "../controllers/auth.controller.js";
import { admin, protect } from "../middlewares/auth.middleware.js";
import rateLimit from 'express-rate-limit';
import { validateLoginBody, validatePasswordChangeBody, validateRegisterBody } from "../middlewares/validation.middleware.js";

const loginLimiter = rateLimit({
  windowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000), // 15 minutes (configurable)
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX || 10), // Limit each IP to 10 requests per windowMs (configurable in tests)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many login attempts from this IP, please try again after 15 minutes." });
  },
});

const router = express.Router();

router.post("/register", validateRegisterBody, register);

router.post("/admin/register", validateRegisterBody, adminRegister);

/* --- LOGIN ROUTES --- */
router.post("/login", loginLimiter, validateLoginBody, login);
router.post("/admin/login", loginLimiter, validateLoginBody, adminLogin);
router.post("/google", googleLogin); // Shared Google login
router.post("/admin/google", adminGoogleLogin); // Secure route for admin Google login

/* --- OTHER AUTH ROUTES --- */
router.post("/logout", protect, logout);

router.post("/change-password", protect, validatePasswordChangeBody, changePassword);

router.put("/settings", protect, updateSettings);

router.delete("/account", protect, deleteAccount);
router.get("/admin/users", protect, admin, getAdminUsers);
router.get("/admin/users/:userId", protect, admin, getAdminUserById);

export default router;
