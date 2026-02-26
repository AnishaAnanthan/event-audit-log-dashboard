import Alert from "../models/alert.model.js";
import mongoose from "mongoose";

export const getAlerts = async (req, res) => {
  try {
    const { status, severity, type, search } = req.query;
    const query = {};
    if (status) query.status = status;
    if (severity) query.severity = severity;
    if (type) query.type = type;
    if (search) {
      query.$or = [{ email: { $regex: search, $options: 'i' } }, { ipAddress: { $regex: search, $options: 'i' } }];
    }

    const alerts = await Alert.find(query).sort({ createdAt: -1 });
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ message: "Error fetching alerts" });
  }
};

export const resolveAlert = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid alert id" });
    }

    const alert = await Alert.findByIdAndUpdate(
      id,
      { status: "RESOLVED", resolvedAt: new Date(), updatedBy: req.user?._id?.toString() || "system" },
      { new: true }
    );

    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }
    
    res.json(alert);
  } catch (error) {
    res.status(500).json({ message: "Error resolving alert" });
  }
};
