import mongoose from "mongoose";

const importedEventSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    ipAddress: {
      type: String,
      required: true,
    },
    geoLocation: {
      country: String,
      region: String,
      city: String,
    },
    endpoint: {
      type: String,
    },
    method: {
      type: String,
    },
    metadata: {
      type: Object,
    },
    createdBy: {
      type: String,
      default: "log-import",
    },
    updatedBy: {
      type: String,
      default: "log-import",
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
  },
  { timestamps: true }
);

export default mongoose.model("ImportedEvent", importedEventSchema);
