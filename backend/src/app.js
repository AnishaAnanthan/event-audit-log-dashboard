import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import requestLogger from "./middlewares/requestLogger.js";
import apiUsageLogger from "./middlewares/apiUsageLogger.middleware.js";
import errorHandler from "./middlewares/errorHandler.js";
import sanitizeInput from "./middlewares/sanitizeInput.middleware.js";
import authRoutes from "./routes/auth.routes.js";
import healthRoute from "./routes/health.route.js";
import eventRoutes from "./routes/event.routes.js";
import alertRoutes from "./routes/alert.routes.js";
import exportRoutes from "./routes/export.routes.js";
import mcpToolsRouter from "./mcp/tools.router.js";
import aiRoutes from "./ai/ai.routes.js";


dotenv.config();
const app = express();

app.disable("x-powered-by");
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 1)); // Safer proxy trust for rate limiting

/* Security Headers */
app.use(helmet());

/* CORS */
app.use(cors());


/* Body parser */
app.use(express.json());

/* Sanitization */
app.use(sanitizeInput); // Prevent NoSQL operator injection and strip basic XSS payloads (Express 5 safe)

/* Request logging */
app.use(requestLogger);
app.use(apiUsageLogger);

/* Routes */
app.use("/", healthRoute);
app.use("/api/auth", authRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/mcp", mcpToolsRouter);
app.use("/api/ai", aiRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

/* Error handler */
app.use(errorHandler);
export default app;
