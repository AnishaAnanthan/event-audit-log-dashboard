import express from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import eventLogger from "../middlewares/eventLogger.middleware.js";

const router = express.Router();

router.get(
  "/health",
  authMiddleware,
  eventLogger("HEALTH_CHECK_ACCESS"),
  (req, res) => {
    res.status(200).json({
      status: "OK",
      message: "Server is healthy"
    });
  }
);

export default router;
