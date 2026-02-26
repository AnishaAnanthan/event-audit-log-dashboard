import mongoose from "mongoose";
import bcrypt from "bcryptjs";
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true
    },
    password: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user"
    },
    provider: { type: String, default: "local" },
    googleId: { type: String, default: null },
    lockUntil: { type: Date },
    riskScore: { type: Number, default: 0 },
    knownDevices: [{ type: String }],
    createdBy: {
      type: String,
      default: "system"
    },
    updatedBy: {
      type: String,
      default: "system"
    }
  },
  { timestamps: true }
);

const BCRYPT_HASH_REGEX = /^\$2[aby]\$\d{2}\$.{53}$/;

userSchema.pre("save", async function userPreSave() {
  if (!this.isModified("password")) return;
  if (typeof this.password !== "string" || this.password.length === 0) return;
  if (BCRYPT_HASH_REGEX.test(this.password)) return;

  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.matchPassword = async function matchPassword(candidatePassword) {
  if (typeof this.password !== "string") return false;
  if (BCRYPT_HASH_REGEX.test(this.password)) {
    return bcrypt.compare(candidatePassword, this.password);
  }
  return this.password === candidatePassword;
};

export default mongoose.model("User", userSchema);
