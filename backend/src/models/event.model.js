import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    ipAddress: {
      type: String,
      required: true
    },

    geoLocation: {
      country: String,
      region: String,
      city: String
    },

    endpoint: {
      type: String
    },

    method: {
      type: String
    },

    metadata: {
      type: Object
    },

    createdBy: {
      type: String,
      default: "system"
    }
  },
  { timestamps: true }
);

export default mongoose.model("Event", eventSchema);
