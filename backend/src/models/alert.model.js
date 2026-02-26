import mongoose from "mongoose";

const alertSchema = new mongoose.Schema({
  type: { type: String, required: true }, // e.g., FAILED_LOGIN_THRESHOLD, IP_BRUTE_FORCE
  severity: { type: String, enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], default: "MEDIUM" },
  email: String,
  ipAddress: String,
  message: String,
  status: { type: String, enum: ["ACTIVE", "RESOLVED"], default: "ACTIVE" },
  occurrenceCount: { type: Number, default: 1 },
  lastTriggeredAt: { type: Date, default: Date.now },
  resolvedAt: Date,
  createdBy: { type: String, default: "system" },
  updatedBy: { type: String, default: "system" }
}, { timestamps: true });

export default mongoose.model("Alert", alertSchema);
