import McpToolAuditLog from "../models/mcpToolAuditLog.model.js";

export const logToolCall = async ({ userId, toolName, input, timestamp }) => {
  await McpToolAuditLog.create({
    userId: userId || null,
    toolName,
    input: input || {},
    timestamp: timestamp || new Date(),
  });
};

