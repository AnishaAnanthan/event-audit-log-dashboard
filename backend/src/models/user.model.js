import mongoose from "mongoose";
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
      enum: ["USER", "ADMIN"],
      default: "USER"
    },
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
export default mongoose.model("User", userSchema);
