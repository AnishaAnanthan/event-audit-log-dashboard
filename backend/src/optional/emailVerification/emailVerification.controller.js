import crypto from "crypto";
import User from "../../models/user.model.js";
import { sendVerificationEmail } from "../../utils/sendEmail.js";

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
const OTP_TTL_MINUTES = Number(process.env.EMAIL_OTP_TTL_MINUTES || 10);

const generateOtp = () => String(crypto.randomInt(0, 1000000)).padStart(6, "0");
const buildOtpExpiry = () => new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
const isOtpExpired = (expiresAt) => !expiresAt || new Date(expiresAt).getTime() < Date.now();

export const verifyEmail = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp || "").trim();
    if (!email || otp.length !== 6) {
      return res.status(400).json({ message: "Email and valid OTP are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.emailVerified) {
      return res.json({ message: "Email already verified" });
    }
    if (user.emailVerificationOtp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }
    if (isOtpExpired(user.otpExpiresAt)) {
      return res.status(400).json({ message: "OTP expired. Please request a new one." });
    }

    user.emailVerified = true;
    user.emailVerificationOtp = null;
    user.otpExpiresAt = null;
    await user.save();

    return res.json({ message: "Email verified successfully" });
  } catch (error) {
    console.error("verifyEmail error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export const resendOtp = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.emailVerified) {
      return res.json({ message: "Email already verified" });
    }

    const otp = generateOtp();
    user.emailVerificationOtp = otp;
    user.otpExpiresAt = buildOtpExpiry();
    await user.save();

    await sendVerificationEmail(email, otp);
    return res.json({ message: "OTP resent successfully" });
  } catch (error) {
    console.error("resendOtp error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

