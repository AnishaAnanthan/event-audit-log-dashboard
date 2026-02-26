import mongoose from "mongoose";
import Alert from "../models/alert.model.js";
import Event from "../models/event.model.js";
import { getAdminStats } from "../controllers/event.controller.js";
import { logEvent } from "../controllers/event.controller.js";
import { getToolDefinition } from "./tools.schema.js";

const MAX_RESULTS = 100;

const SENSITIVE_KEYS = ["password", "token", "secret", "authorization", "cookie", "jwt"];

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const clampLimit = (value, fallback = 20) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(MAX_RESULTS, Math.floor(parsed));
};

const isISODate = (value) => {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
};

const redactSensitive = (value) => {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (!isPlainObject(value)) return value;

  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEYS.some((s) => key.toLowerCase().includes(s))) {
      output[key] = "[REDACTED]";
      continue;
    }
    output[key] = redactSensitive(child);
  }
  return output;
};

const assertToolInputShape = (toolName, input) => {
  const tool = getToolDefinition(toolName);
  if (!tool) {
    const err = new Error("Unsupported tool");
    err.statusCode = 400;
    throw err;
  }

  if (input === undefined) return;
  if (!isPlainObject(input)) {
    const err = new Error("Tool arguments must be an object");
    err.statusCode = 400;
    throw err;
  }

  const allowedKeys = Object.keys(tool.inputSchema.properties || {});
  const providedKeys = Object.keys(input);
  for (const key of providedKeys) {
    if (!allowedKeys.includes(key)) {
      const err = new Error(`Unsupported argument: ${key}`);
      err.statusCode = 400;
      throw err;
    }
  }
};

const assertAdminForActionTool = (toolName, user) => {
  const tool = getToolDefinition(toolName);
  if (tool?.roleRequirement === "admin" && user?.role !== "admin") {
    const err = new Error("Admin role is required for this tool");
    err.statusCode = 403;
    throw err;
  }
};

const buildTimeQuery = ({ timeframe, startDate, endDate }) => {
  const query = {};

  if (timeframe) {
    const raw = String(timeframe).trim().toLowerCase();
    const map = {
      "1h": 1,
      "6h": 6,
      "24h": 24,
      "48h": 48,
      "72h": 72,
      "3d": 72,
      "7d": 168,
      "30d": 720,
      "3 days": 72,
      "7 days": 168,
      "30 days": 720,
      "past 3 days": 72,
      "past 7 days": 168,
      "past 30 days": 720,
    };
    let hours = map[raw];

    if (!hours) {
      const match = raw.match(/^(\d+)\s*(h|hr|hrs|hour|hours|d|day|days|w|week|weeks)$/i);
      if (match) {
        const amount = Number(match[1]);
        const unit = match[2].toLowerCase();
        if (Number.isFinite(amount) && amount > 0) {
          if (unit.startsWith("h")) hours = amount;
          if (unit.startsWith("d")) hours = amount * 24;
          if (unit.startsWith("w")) hours = amount * 24 * 7;
        }
      }
    }

    if (!hours) {
      const err = new Error("Invalid timeframe");
      err.statusCode = 400;
      throw err;
    }
    query.createdAt = { $gte: new Date(Date.now() - hours * 60 * 60 * 1000) };
    return query;
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      if (!isISODate(startDate)) {
        const err = new Error("Invalid startDate");
        err.statusCode = 400;
        throw err;
      }
      query.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      if (!isISODate(endDate)) {
        const err = new Error("Invalid endDate");
        err.statusCode = 400;
        throw err;
      }
      query.createdAt.$lte = new Date(endDate);
    }
  }

  return query;
};

const normalizeEventTypeFilter = (rawValue) => {
  if (!rawValue) return null;
  const raw = String(rawValue).trim();
  const compact = raw.toLowerCase().replace(/[\s-]+/g, "_");

  const map = {
    failed_user_login: "LOGIN_FAILED",
    failed_user_logins: "LOGIN_FAILED",
    login_failed: "LOGIN_FAILED",
    failed_admin_login: "ADMIN_LOGIN_FAILED",
    failed_admin_logins: "ADMIN_LOGIN_FAILED",
    admin_login_failed: "ADMIN_LOGIN_FAILED",
    user_login_success: "LOGIN_SUCCESS",
    login_success: "LOGIN_SUCCESS",
    admin_login_success: "ADMIN_LOGIN_SUCCESS",
  };

  if (map[compact]) {
    return { exact: map[compact] };
  }

  if (compact.includes("failed") && compact.includes("admin")) {
    return { exact: "ADMIN_LOGIN_FAILED" };
  }

  if (compact.includes("failed") && compact.includes("user")) {
    return { exact: "LOGIN_FAILED" };
  }

  if (compact.includes("failed") && compact.includes("login")) {
    return { anyOf: ["LOGIN_FAILED", "ADMIN_LOGIN_FAILED"] };
  }

  const tokenized = raw.replace(/[\s-]+/g, "_");
  return { regex: tokenized };
};

const getAdminStatsTool = async (_input, _req, _user) => {
  const responseContainer = {
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.payload = data;
      return data;
    },
  };

  await getAdminStats({}, responseContainer);

  if (!responseContainer.payload) {
    const err = new Error("Failed to fetch admin stats");
    err.statusCode = responseContainer.statusCode || 500;
    throw err;
  }

  return { stats: responseContainer.payload };
};

const getAlertsTool = async (input = {}) => {
  const query = {};
  if (input.alertId) {
    if (!mongoose.Types.ObjectId.isValid(input.alertId)) {
      const err = new Error("Invalid alertId");
      err.statusCode = 400;
      throw err;
    }
    query._id = input.alertId;
  }
  if (input.severity) query.severity = input.severity;
  if (input.status) query.status = input.status;
  if (input.type) query.type = input.type;

  if (input.search) {
    query.$or = [
      { email: { $regex: input.search, $options: "i" } },
      { ipAddress: { $regex: input.search, $options: "i" } },
    ];
  }

  Object.assign(query, buildTimeQuery(input));

  const limit = clampLimit(input.limit, 20);
  const alerts = await Alert.find(query).sort({ createdAt: -1 }).limit(limit).lean();
  return {
    count: alerts.length,
    alerts: redactSensitive(alerts),
  };
};

const getAuditLogsTool = async (input = {}) => {
  const query = {};

  if (input.eventType) {
    const normalized = normalizeEventTypeFilter(input.eventType);
    if (normalized?.exact) query.eventType = normalized.exact;
    else if (normalized?.anyOf) query.eventType = { $in: normalized.anyOf };
    else if (normalized?.regex) query.eventType = { $regex: normalized.regex, $options: "i" };
  }
  if (input.ipAddress) query.ipAddress = input.ipAddress;
  if (input.userId) {
    if (!mongoose.Types.ObjectId.isValid(input.userId)) {
      const err = new Error("Invalid userId");
      err.statusCode = 400;
      throw err;
    }
    query.userId = input.userId;
  }

  Object.assign(query, buildTimeQuery(input));

  const limit = clampLimit(input.limit, 20);
  const page = Math.max(1, Number(input.page) || 1);

  const [events, total] = await Promise.all([
    Event.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Event.countDocuments(query),
  ]);

  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
    records: redactSensitive(events),
  };
};

const resolveAlertTool = async (input = {}, req, user) => {
  if (!mongoose.Types.ObjectId.isValid(input.alertId || "")) {
    const err = new Error("Invalid alertId");
    err.statusCode = 400;
    throw err;
  }

  const updated = await Alert.findByIdAndUpdate(
    input.alertId,
    {
      status: "RESOLVED",
      resolvedAt: new Date(),
      updatedBy: user?._id?.toString() || "system",
    },
    { new: true }
  ).lean();

  if (!updated) {
    const err = new Error("Alert not found");
    err.statusCode = 404;
    throw err;
  }

  await logEvent("MCP_ALERT_RESOLVED", {
    req,
    userId: user?._id || null,
    data: { alertId: input.alertId, tool: "resolve_alert" },
  });

  return { alert: redactSensitive(updated) };
};

const TOOL_HANDLERS = {
  get_admin_stats: getAdminStatsTool,
  get_alerts: getAlertsTool,
  get_audit_logs: getAuditLogsTool,
  resolve_alert: resolveAlertTool,
};

export const executeMcpTool = async ({ toolName, input, req, user }) => {
  assertToolInputShape(toolName, input || {});
  assertAdminForActionTool(toolName, user);

  const handler = TOOL_HANDLERS[toolName];
  if (!handler) {
    const err = new Error("Tool handler not implemented");
    err.statusCode = 400;
    throw err;
  }

  const safeResult = await handler(input || {}, req, user);
  return {
    tool: toolName,
    data: redactSensitive(safeResult),
  };
};
