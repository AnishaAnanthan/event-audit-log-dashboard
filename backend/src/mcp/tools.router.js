import express from "express";
import rateLimit from "express-rate-limit";
import { protect } from "../middlewares/auth.middleware.js";
import { executeMcpTool } from "./tools.handlers.js";
import { getToolDefinition, MCP_TOOLS } from "./tools.schema.js";
import { logToolCall } from "./tools.audit.js";

const router = express.Router();

const mcpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.MCP_RATE_LIMIT_MAX || 30),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ message: "Too many MCP requests. Please try again shortly." });
  },
});

const validateExecuteBody = (req, res, next) => {
  const { toolName, arguments: args } = req.body || {};
  if (!toolName || typeof toolName !== "string") {
    return res.status(400).json({ message: "toolName is required" });
  }

  if (args !== undefined && (args === null || typeof args !== "object" || Array.isArray(args))) {
    return res.status(400).json({ message: "arguments must be an object" });
  }

  const tool = getToolDefinition(toolName);
  if (!tool) {
    return res.status(400).json({ message: "Unsupported tool" });
  }
  return next();
};

router.get("/tools", protect, (_req, res) => {
  const definitions = MCP_TOOLS.map(({ name, description, inputSchema, roleRequirement }) => ({
    name,
    description,
    inputSchema,
    roleRequirement,
  }));
  return res.json({ tools: definitions });
});

router.post("/execute", mcpLimiter, protect, validateExecuteBody, async (req, res, next) => {
  const { toolName, arguments: input = {} } = req.body;

  try {
    await logToolCall({
      userId: req.user?._id || null,
      toolName,
      input,
      timestamp: new Date(),
    });

    const result = await executeMcpTool({
      toolName,
      input,
      req,
      user: req.user,
    });

    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

export default router;

