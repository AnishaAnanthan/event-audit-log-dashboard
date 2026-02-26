import express from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { logEvent } from "../controllers/event.controller.js";

const router = express.Router();

router.get(
  "/health",
  protect,
  async (req, res) => {
    await logEvent("HEALTH_CHECK_ACCESS", { req });
    res.status(200).json({ status: "OK" });
  }
);

export default router;