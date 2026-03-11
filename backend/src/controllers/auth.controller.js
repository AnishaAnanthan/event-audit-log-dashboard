import User from "../models/user.model.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import Event from "../models/event.model.js";
import Alert from "../models/alert.model.js";
import { logEvent, triggerAlert, updateRiskScore } from "./event.controller.js";
import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "30d" });
};

const BCRYPT_HASH_REGEX = /^\$2[aby]\$\d{2}\$.{53}$/;
const hashPasswordIfNeeded = async (value) => {
  if (typeof value !== "string") return value;
  if (BCRYPT_HASH_REGEX.test(value)) return value;
  return bcrypt.hash(value, 10);
};

const isAdminRole = (role) => String(role || "").toLowerCase() === "admin";
const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const computeEffectiveRiskScore = async (user) => {
  if (!user?._id) return Number(user?.riskScore || 0);

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const accountAgeDays = Math.max(
    0,
    Math.floor((Date.now() - new Date(user.createdAt || Date.now()).getTime()) / (24 * 60 * 60 * 1000))
  );

  const [failedLogins24h, uniqueIps24h, activeAlerts, recentSuccessEvents] = await Promise.all([
    Event.countDocuments({
      userId: user._id,
      eventType: { $in: ["LOGIN_FAILED", "ADMIN_LOGIN_FAILED"] },
      createdAt: { $gte: since24h },
    }),
    Event.distinct("ipAddress", { userId: user._id, createdAt: { $gte: since24h } }),
    Alert.countDocuments({
      status: "ACTIVE",
      ...(user.email ? { email: user.email } : {}),
    }),
    Event.find({
      userId: user._id,
      eventType: { $in: ["LOGIN_SUCCESS", "ADMIN_LOGIN_SUCCESS"] },
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .select("geoLocation.country")
      .lean(),
  ]);

  const distinctCountries = new Set(
    recentSuccessEvents
      .map((event) => event?.geoLocation?.country)
      .filter((country) => country && String(country).toUpperCase() !== "LOCAL")
  );
  const newCountryLogin = distinctCountries.size > 1;
  const multipleIpUsage = (uniqueIps24h || []).length;

  let score = 100;
  score -= failedLogins24h * 5;
  score -= newCountryLogin ? 15 : 0;
  score -= activeAlerts * 10;
  if (multipleIpUsage > 1) score -= 5;
  if (multipleIpUsage >= 4) score -= 10;
  if (accountAgeDays < 7) score -= 10;

  score = Math.max(0, Math.min(100, score));
  return score;
};

export const register = async (req, res) => {
  try {
    const { name, password } = req.body;
    const email = normalizeEmail(req.body?.email);
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const safePassword = await hashPasswordIfNeeded(password);
    const user = await User.create({
      name,
      email,
      password: safePassword,
      emailVerified: true,
      emailVerificationOtp: null,
      otpExpiresAt: null,
    });

    await logEvent("USER_REGISTERED", { req, userId: user._id, data: { email } });

    res.status(201).json({ message: "Registration successful. You can now log in." });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ message: "User already exists" });
    }
    console.error("register error:", error);
    res.status(500).json({ message: process.env.NODE_ENV === "development" ? (error?.message || "Server error") : "Server error" });
  }
};

export const login = async (req, res) => {
  try {
    const { password } = req.body;
    const email = normalizeEmail(req.body?.email);
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email });

    // Check Account Lockout
    if (user && user.lockUntil && user.lockUntil > Date.now()) {
      return res.status(403).json({ message: "Account locked due to suspicious activity. Try again later." });
    }

    const isValidPassword = user ? await user.matchPassword(password) : false;
    if (user && isValidPassword) {
      // Device Fingerprinting
      const userAgent = req.headers['user-agent'];
      if (user.knownDevices && !user.knownDevices.includes(userAgent)) {
        user.knownDevices.push(userAgent);
        await user.save();
        await triggerAlert({ type: "NEW_DEVICE_LOGIN", severity: "MEDIUM", email, ipAddress: req.ip, message: "Login from new device detected" });
      }

      const token = generateToken(user._id);
      await logEvent("LOGIN_SUCCESS", { req, userId: user._id, data: { email } });
      res.json({ token, user: { _id: user._id, name: user.name, email: user.email, role: user.role } });
    } else {
      // Log failed attempt to trigger alert logic
      await logEvent("LOGIN_FAILED", { req, data: { email } });
      if (user) await updateRiskScore(email, 10);
      res.status(401).json({ message: "Invalid email or password" });
    }
  } catch (error) {
    console.error("login error:", error);
    res.status(500).json({ message: process.env.NODE_ENV === "development" ? (error?.message || "Server error") : "Server error" });
  }
};

export const adminLogin = async (req, res) => {
  try {
    const { password } = req.body;
    const email = normalizeEmail(req.body?.email);
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email });

    if (user && user.lockUntil && user.lockUntil > Date.now()) {
      return res.status(403).json({ message: "Account locked due to suspicious activity." });
    }

    const isValidPassword = user ? await user.matchPassword(password) : false;
    if (user && isValidPassword && isAdminRole(user.role)) {
      const token = generateToken(user._id);
      await logEvent("ADMIN_LOGIN_SUCCESS", { req, userId: user._id, data: { email } });
      res.json({ token, user: { _id: user._id, name: user.name, email: user.email, role: user.role } });
    } else {
      await logEvent("ADMIN_LOGIN_FAILED", { req, data: { email, reason: "Invalid credentials" } });
      // Note: If user was created via Google, they must use Google Login as they have no password.
      if (user) await updateRiskScore(email, 30);
      res.status(401).json({ message: "Invalid admin credentials" });
    }
  } catch (error) {
    console.error("adminLogin error:", error);
    res.status(500).json({ message: process.env.NODE_ENV === "development" ? (error?.message || "Server error") : "Server error" });
  }
};

export const adminRegister = async (req, res) => {
  try {
    const { name, password } = req.body;
    const email = normalizeEmail(req.body?.email);
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ message: "User already exists" });

    const safePassword = await hashPasswordIfNeeded(password);
    const user = await User.create({
      name,
      email,
      password: safePassword,
      role: "admin",
      emailVerified: true,
      emailVerificationOtp: null,
      otpExpiresAt: null,
    });
    
    await logEvent("ADMIN_REGISTERED", { req, userId: user._id, data: { email } });

    res.status(201).json({ message: "Registration successful. You can now log in." });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ message: "User already exists" });
    }
    console.error("adminRegister error:", error);
    res.status(500).json({ message: process.env.NODE_ENV === "development" ? (error?.message || "Server error") : "Server error" });
  }
};

export const googleLogin = async (req, res) => {
  try {
    const { token } = req.body;
    const ticket = await client.verifyIdToken({ idToken: token, audience: process.env.GOOGLE_CLIENT_ID });
    const { name, email, sub: googleId } = ticket.getPayload();

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        name,
        email,
        googleId,
        provider: "google",
        password: "google-login-no-pass",
        emailVerified: true,
        emailVerificationOtp: null,
        otpExpiresAt: null,
      });
    } else if (!user.emailVerified) {
      user.emailVerified = true;
      user.emailVerificationOtp = null;
      user.otpExpiresAt = null;
      await user.save();
    }

    const jwtToken = generateToken(user._id);
    await logEvent("GOOGLE_LOGIN_SUCCESS", { req, userId: user._id, data: { email } });
    res.json({ token: jwtToken, user: { _id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    await logEvent("GOOGLE_LOGIN_FAILED", { req, error: "Google token verification failed" });
    res.status(401).json({ message: "Google login failed" });
  }
};

export const adminGoogleLogin = async (req, res) => {
  try {
    const { token } = req.body;
    const ticket = await client.verifyIdToken({ idToken: token, audience: process.env.GOOGLE_CLIENT_ID });
    const { email } = ticket.getPayload();

    const user = await User.findOne({ email });

    // CRITICAL CHECK: User must exist and be an admin
    if (user && user.role === 'admin') {
      if (!user.emailVerified) {
        user.emailVerified = true;
        user.emailVerificationOtp = null;
        user.otpExpiresAt = null;
        await user.save();
      }
      const jwtToken = generateToken(user._id);
      await logEvent("ADMIN_GOOGLE_LOGIN_SUCCESS", { req, userId: user._id, data: { email } });
      res.json({ token: jwtToken, user: { _id: user._id, name: user.name, email: user.email, role: user.role } });
    } else {
      await logEvent("GOOGLE_LOGIN_FAILED", { req, data: { email, type: 'admin_attempt' } });
      res.status(403).json({ message: "This Google account is not authorized for admin access." });
    }
  } catch (error) {
    await logEvent("GOOGLE_LOGIN_FAILED", { req, error: "Admin Google token verification failed" });
    res.status(401).json({ message: "Google login failed" });
  }
};

export const logout = async (req, res) => {
  await logEvent("USER_LOGOUT", { req, userId: req.user?._id });
  res.json({ message: "Logged out successfully" });
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new passwords are required" });
    }

    const user = await User.findById(req.user._id);
    
    const isValidPassword = await user.matchPassword(currentPassword);
    if (!isValidPassword) {
      return res.status(400).json({ message: "Invalid current password" });
    }
    
    user.password = await hashPasswordIfNeeded(newPassword);
    user.updatedBy = req.user?._id?.toString() || "system";
    await user.save();
    await logEvent("PASSWORD_CHANGED", { req, userId: user._id });
    res.json({ message: "Password updated" });
  } catch (error) {
    res.status(500).json({ message: "Error changing password" });
  }
};

export const updateSettings = async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, {
    updatedBy: req.user?._id?.toString() || "system",
  });
  await logEvent("USER_SETTINGS_UPDATED", { req, userId: req.user._id, data: { preferences: req.body?.preferences || {} } });
  res.json({ message: "Settings updated" });
};

export const deleteAccount = async (req, res) => {
  await logEvent("ACCOUNT_DELETED", { req, userId: req.user._id });
  await User.findByIdAndDelete(req.user._id);
  res.json({ message: "Account deleted" });
};

export const getAdminUsers = async (_req, res) => {
  try {
    const users = await User.find({})
      .select("_id name email role provider knownDevices riskScore createdAt updatedAt createdBy updatedBy")
      .sort({ createdAt: -1 })
      .lean();

    const scoredRows = await Promise.all(
      users.map(async (user) => {
        const effectiveRiskScore = await computeEffectiveRiskScore(user);
        return {
          ...user,
          riskScore: effectiveRiskScore,
        };
      })
    );

    const safeRows = scoredRows.map((user) => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      provider: user.provider,
      riskScore: Number(user.riskScore || 0),
      knownDevicesCount: Array.isArray(user.knownDevices) ? user.knownDevices.length : 0,
      createdBy: user.createdBy || "system",
      updatedBy: user.updatedBy || "system",
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));

    return res.json({ users: safeRows });
  } catch (_error) {
    return res.status(500).json({ message: "Server error" });
  }
};

export const getAdminUserById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.userId || "")) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const [user, recentActions] = await Promise.all([
      User.findById(req.params.userId)
        .select("_id name email role provider knownDevices riskScore createdBy updatedBy createdAt updatedAt")
        .lean(),
      Event.find({ userId: req.params.userId })
        .sort({ createdAt: -1 })
        .limit(10)
        .select("_id eventType endpoint method ipAddress createdAt metadata")
        .lean(),
    ]);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const effectiveRiskScore = await computeEffectiveRiskScore(user);

    return res.json({
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        provider: user.provider,
        riskScore: Number(effectiveRiskScore || 0),
        knownDevices: Array.isArray(user.knownDevices) ? user.knownDevices : [],
        createdBy: user.createdBy || "system",
        updatedBy: user.updatedBy || "system",
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        recentActions: recentActions.map((action) => ({
          _id: action._id,
          eventType: action.eventType,
          endpoint: action.endpoint || "",
          method: action.method || "",
          ipAddress: action.ipAddress || "",
          createdAt: action.createdAt,
          metadata: action.metadata || {},
        })),
      },
    });
  } catch (_error) {
    return res.status(500).json({ message: "Server error" });
  }
};
