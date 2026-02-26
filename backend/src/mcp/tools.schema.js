const tools = [
  {
    name: "get_admin_stats",
    description: "Fetch aggregated admin dashboard statistics for security monitoring.",
    roleRequirement: "authenticated",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "get_alerts",
    description: "Fetch security alerts with safe filter options.",
    roleRequirement: "authenticated",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        alertId: { type: "string", minLength: 24, maxLength: 24 },
        severity: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
        status: { type: "string", enum: ["ACTIVE", "RESOLVED"] },
        type: { type: "string", minLength: 1, maxLength: 100 },
        search: { type: "string", minLength: 1, maxLength: 120 },
        startDate: { type: "string", format: "date-time" },
        endDate: { type: "string", format: "date-time" },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
  },
  {
    name: "get_audit_logs",
    description: "Fetch audit/event logs using predefined safe filters and bounded results.",
    roleRequirement: "authenticated",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        eventType: { type: "string", minLength: 1, maxLength: 100 },
        ipAddress: { type: "string", minLength: 2, maxLength: 64 },
        userId: { type: "string", minLength: 24, maxLength: 24 },
        timeframe: { type: "string", minLength: 2, maxLength: 30 },
        startDate: { type: "string", format: "date-time" },
        endDate: { type: "string", format: "date-time" },
        page: { type: "integer", minimum: 1, maximum: 1000 },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
  },
  {
    name: "resolve_alert",
    description: "Resolve an active alert by ID.",
    roleRequirement: "admin",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["alertId"],
      properties: {
        alertId: { type: "string", minLength: 24, maxLength: 24 },
      },
    },
  },
];

export const MCP_TOOLS = Object.freeze(tools);

export const getToolDefinition = (toolName) =>
  MCP_TOOLS.find((tool) => tool.name === toolName) || null;
