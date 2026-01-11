import express from "express";
import dotenv from "dotenv";
import requestLogger from "./middlewares/requestLogger.js";
import errorHandler from "./middlewares/errorHandler.js";
import authRoutes from "./routes/auth.routes.js";
import healthRoute from "./routes/health.route.js";

dotenv.config();
const app = express();

/* Body parser */
app.use(express.json());

/* Request logging */
app.use(requestLogger);

/* Routes */
app.use("/", healthRoute);
app.use("/api/auth", authRoutes);

/* Error handler */
app.use(errorHandler);

export default app;
