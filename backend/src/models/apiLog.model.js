import mongoose from "mongoose";

const apiLogSchema = new mongoose.Schema(
  {
    endpoint: { type: String, required: true },
    method: { type: String, required: true },
    responseStatus: { type: Number, required: true },
    responseTimeMs: { type: Number, required: true },
    ipAddress: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

export default mongoose.model("ApiLog", apiLogSchema);
