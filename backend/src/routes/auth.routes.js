import express from "express";
import { register, login } from "../controllers/auth.controller.js";
import eventLogger from "../middlewares/eventLogger.middleware.js";

const router = express.Router();

router.post("/register", eventLogger("USER_REGISTERED"), register);
router.post("/login", eventLogger("LOGIN_ATTEMPT"), login);

export default router;
