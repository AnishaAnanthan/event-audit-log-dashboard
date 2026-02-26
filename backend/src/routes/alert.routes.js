import express from "express";
import { protect, admin } from "../middlewares/auth.middleware.js";
import { getAlerts, resolveAlert } from "../controllers/alert.controller.js";

const router = express.Router();

router.get("/", protect, admin, getAlerts);
router.put("/:id/resolve", protect, admin, resolveAlert);

export default router;