import axios from "axios";
import { MCP_TOOLS } from "../mcp/tools.schema.js";

const parseKeyList = (value = "") =>
  String(value || "")
    .split(/[\n,;]+/g)
    .map((item) => item.trim())
    .filter(Boolean);

const mergeUniqueKeys = (...groups) => {
  const seen = new Set();
  const merged = [];
  groups.flat().forEach((key) => {
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(key);
  });
  return merged;
};

const aiKeyState = {
  openai: { cursor: 0, cooldownUntil: new Map() },
  gemini: { cursor: 0, cooldownUntil: new Map() },
};

const getKeyCooldownMs = () => {
  const parsed = Number(process.env.AI_KEY_COOLDOWN_MS || 300000);
  if (!Number.isFinite(parsed) || parsed <= 0) return 300000;
  return parsed;
};

const getAuthCooldownMs = () => {
  const parsed = Number(process.env.AI_AUTH_KEY_COOLDOWN_MS || 3600000);
  if (!Number.isFinite(parsed) || parsed <= 0) return 3600000;
  return parsed;
};

const pickProviderKey = (providerName, keys = []) => {
  const state = aiKeyState[providerName];
  const now = Date.now();

  for (let attempts = 0; attempts < keys.length; attempts += 1) {
    const idx = (state.cursor + attempts) % keys.length;
    const candidate = keys[idx];
    const blockedUntil = state.cooldownUntil.get(candidate) || 0;
    if (blockedUntil > now) continue;
    state.cursor = (idx + 1) % keys.length;
    return candidate;
  }

  return null;
};

const cooldownProviderKey = (providerName, key, ms) => {
  if (!key) return;
  aiKeyState[providerName].cooldownUntil.set(key, Date.now() + Math.max(1000, ms));
};

const clearProviderKeyCooldown = (providerName, key) => {
  if (!key) return;
  aiKeyState[providerName].cooldownUntil.delete(key);
};

const getAiConfig = () => {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  const geminiKeys = mergeUniqueKeys(
    parseKeyList(process.env.GEMINI_API_KEYS),
    parseKeyList(process.env.GOOGLE_API_KEYS),
    parseKeyList(geminiKey)
  );
  const openAiKeys = mergeUniqueKeys(
    parseKeyList(process.env.OPENAI_API_KEYS),
    parseKeyList(process.env.OPENAI_API_KEY)
  );

  const aiProvider = (process.env.AI_PROVIDER || (geminiKey ? "gemini" : "openai"))
    .toLowerCase()
    .trim();

  return {
    aiProvider,
    openAiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
    geminiModel: process.env.GEMINI_MODEL || "gemini-1.5-flash",
    maxOutputTokens: Math.min(Number(process.env.AI_MAX_OUTPUT_TOKENS || 500), 1000),
    maxToolCalls: Math.min(Number(process.env.AI_MAX_TOOL_CALLS || 5), 10),
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || 15000),
    openAiKey: openAiKeys[0] || "",
    geminiKey: geminiKeys[0] || "",
    openAiKeys,
    geminiKeys,
  };
};

const buildOpenAITools = () =>
  MCP_TOOLS.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));

const toGeminiType = (type = "") => {
  const map = {
    object: "OBJECT",
    array: "ARRAY",
    string: "STRING",
    number: "NUMBER",
    integer: "INTEGER",
    boolean: "BOOLEAN",
  };
  return map[String(type).toLowerCase()] || "STRING";
};

const convertJsonSchemaToGeminiSchema = (schema = {}) => {
  const out = {};
  if (schema.type) out.type = toGeminiType(schema.type);
  if (schema.description) out.description = schema.description;
  if (Array.isArray(schema.enum)) out.enum = schema.enum;
  if (Array.isArray(schema.required)) out.required = schema.required;

  if (schema.properties && typeof schema.properties === "object") {
    out.properties = {};
    for (const [key, prop] of Object.entries(schema.properties)) {
      out.properties[key] = convertJsonSchemaToGeminiSchema(prop);
    }
  }

  if (schema.items && typeof schema.items === "object") {
    out.items = convertJsonSchemaToGeminiSchema(schema.items);
  }

  return out;
};

const buildGeminiTools = () => ({
  tools: [
    {
      functionDeclarations: MCP_TOOLS.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: convertJsonSchemaToGeminiSchema(tool.inputSchema),
      })),
    },
  ],
});

const getInternalApiBaseUrl = () => {
  const configured = process.env.INTERNAL_API_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
  // On some developer machines 127.0.0.1:5000 is served by another local process.
  // Normalize to localhost to target this Node app consistently.
  return configured.replace("127.0.0.1", "localhost");
};

const callMcpTool = async ({ authHeader, toolName, args }) => {
  const { timeoutMs } = getAiConfig();
  const response = await axios.post(
    `${getInternalApiBaseUrl()}/api/mcp/execute`,
    { toolName, arguments: args || {} },
    {
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      timeout: timeoutMs,
    }
  );
  return response.data;
};

const callOpenAI = async ({ messages, tools }) => {
  const { openAiKeys, openAiModel, maxOutputTokens, timeoutMs } = getAiConfig();
  if (!openAiKeys.length) {
    const err = new Error("OPENAI_API_KEY is not configured");
    err.statusCode = 503;
    throw err;
  }

  let lastError = null;
  for (let attempt = 0; attempt < openAiKeys.length; attempt += 1) {
    const apiKey = pickProviderKey("openai", openAiKeys);
    if (!apiKey) break;

    const payload = {
      model: openAiModel,
      messages,
      temperature: 0.2,
      max_tokens: maxOutputTokens,
    };

    if (Array.isArray(tools) && tools.length) {
      payload.tools = tools;
      payload.tool_choice = "auto";
    }

    try {
      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        payload,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: timeoutMs,
        }
      );

      clearProviderKeyCooldown("openai", apiKey);
      return response.data;
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
      const upstreamMessage =
        error?.response?.data?.error?.message || error?.response?.data?.message || error?.message;

      if (status === 429) {
        cooldownProviderKey("openai", apiKey, getKeyCooldownMs());
        continue;
      }

      if (status === 401 || status === 403) {
        cooldownProviderKey("openai", apiKey, getAuthCooldownMs());
        continue;
      }

      if (status === 400) {
        const err = new Error(`OpenAI request rejected: ${upstreamMessage}`);
        err.statusCode = 502;
        err.details = upstreamMessage;
        throw err;
      }

      if (error?.code === "ECONNABORTED") {
        const err = new Error("AI provider timeout. Please retry.");
        err.statusCode = 504;
        err.details = upstreamMessage;
        throw err;
      }

      const err = new Error("AI provider request failed");
      err.statusCode = 502;
      err.details = upstreamMessage;
      throw err;
    }
  }

  const lastStatus = lastError?.response?.status;
  const lastMessage =
    lastError?.response?.data?.error?.message ||
    lastError?.response?.data?.message ||
    lastError?.message;

  if (lastStatus === 429) {
    const err = new Error(
      "All configured OpenAI keys are rate-limited/quota-exhausted. Retry after cooldown."
    );
    err.statusCode = 429;
    err.details = lastMessage;
    throw err;
  }

  if (lastStatus === 401 || lastStatus === 403) {
    const err = new Error("All configured OpenAI keys failed authentication.");
    err.statusCode = 502;
    err.details = lastMessage;
    throw err;
  }

  const err = new Error("AI provider request failed");
  err.statusCode = 502;
  err.details = lastMessage;
  throw err;
};

const callGemini = async ({ contents, tools }) => {
  const { geminiKeys, geminiModel, maxOutputTokens, timeoutMs } = getAiConfig();
  if (!geminiKeys.length) {
    const err = new Error("GEMINI_API_KEY (or GOOGLE_API_KEY) is not configured");
    err.statusCode = 503;
    throw err;
  }

  let lastError = null;
  for (let attempt = 0; attempt < geminiKeys.length; attempt += 1) {
    const apiKey = pickProviderKey("gemini", geminiKeys);
    if (!apiKey) break;

    const model = geminiModel;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const payload = {
      contents,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens,
      },
    };

    if (tools?.tools?.length) {
      payload.tools = tools.tools;
    }

    try {
      const response = await axios.post(
        url,
        payload,
        {
          headers: { "Content-Type": "application/json" },
          timeout: timeoutMs,
        }
      );
      clearProviderKeyCooldown("gemini", apiKey);
      return response.data;
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
      const upstreamMessage =
        error?.response?.data?.error?.message || error?.response?.data?.message || error?.message;

      if (status === 429) {
        cooldownProviderKey("gemini", apiKey, getKeyCooldownMs());
        continue;
      }

      if (status === 401 || status === 403) {
        cooldownProviderKey("gemini", apiKey, getAuthCooldownMs());
        continue;
      }

      if (status === 400) {
        const err = new Error(`Gemini request rejected: ${upstreamMessage}`);
        err.statusCode = 502;
        err.details = upstreamMessage;
        throw err;
      }

      if (error?.code === "ECONNABORTED") {
        const err = new Error("AI provider timeout. Please retry.");
        err.statusCode = 504;
        err.details = upstreamMessage;
        throw err;
      }

      const err = new Error("AI provider request failed");
      err.statusCode = 502;
      err.details = upstreamMessage;
      throw err;
    }
  }

  const lastStatus = lastError?.response?.status;
  const lastMessage =
    lastError?.response?.data?.error?.message ||
    lastError?.response?.data?.message ||
    lastError?.message;

  if (lastStatus === 429) {
    const err = new Error(
      "All configured Gemini keys are rate-limited/quota-exhausted. Retry after cooldown."
    );
    err.statusCode = 429;
    err.details = lastMessage;
    throw err;
  }

  if (lastStatus === 401 || lastStatus === 403) {
    const err = new Error("All configured Gemini keys failed authentication.");
    err.statusCode = 502;
    err.details = lastMessage;
    throw err;
  }

  const err = new Error("AI provider request failed");
  err.statusCode = 502;
  err.details = lastMessage;
  throw err;
};

const safeParseToolArgs = (raw) => {
  if (!raw) return {};
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const tryParseJson = (value) => {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
};

const callProviderText = async ({ prompt }) => {
  const { aiProvider, openAiModel, geminiModel } = getAiConfig();

  if (aiProvider === "gemini") {
    const llm = await callGemini({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: null,
    });
    const parts = llm?.candidates?.[0]?.content?.parts || [];
    const text = parts.map((p) => p?.text || "").join("\n").trim();
    return { text, model: llm?.modelVersion || geminiModel };
  }

  const llm = await callOpenAI({
    messages: [{ role: "user", content: prompt }],
    tools: null,
  });
  const text = llm?.choices?.[0]?.message?.content || "";
  return { text, model: llm?.model || openAiModel };
};

const runWithOpenAI = async ({ query, authHeader, user }) => {
  const { maxToolCalls, openAiModel } = getAiConfig();
  const tools = buildOpenAITools();
  const toolsUsed = [];
  const toolResults = [];

  const systemPrompt =
    "You are a security operations AI assistant. Use tools when data is needed. " +
    "Never claim direct database access. Keep answers concise and structured.";

  const messages = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `User role: ${user?.role || "unknown"}\nRequest: ${query}`,
    },
  ];

  for (let step = 0; step < maxToolCalls; step += 1) {
    const llm = await callOpenAI({ messages, tools });
    const choice = llm?.choices?.[0]?.message;

    if (!choice) {
      const err = new Error("AI response was empty");
      err.statusCode = 502;
      throw err;
    }

    const toolCalls = choice.tool_calls || [];
    if (!toolCalls.length) {
      return {
        answer: choice.content || "No response generated.",
        toolsUsed,
        toolResults,
        model: llm?.model || openAiModel,
      };
    }

    messages.push({
      role: "assistant",
      content: choice.content || "",
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const toolName = call?.function?.name;
      const toolArgs = safeParseToolArgs(call?.function?.arguments);
      const result = await callMcpTool({ authHeader, toolName, args: toolArgs });
      toolsUsed.push({ toolName, args: toolArgs });
      toolResults.push({ toolName, args: toolArgs, result });

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  return {
    answer: "I reached tool-call limit before finalizing the response.",
    toolsUsed,
    toolResults,
    model: openAiModel,
  };
};

const runWithGemini = async ({ query, authHeader, user }) => {
  const { maxToolCalls, geminiModel } = getAiConfig();
  const tools = buildGeminiTools();
  const toolsUsed = [];
  const toolResults = [];
  const systemPrompt =
    "You are a security operations AI assistant. Use tools when data is needed. " +
    "Never claim direct database access. Keep answers concise and structured.";

  const contents = [
    {
      role: "user",
      parts: [
        {
          text: `${systemPrompt}\n\nUser role: ${user?.role || "unknown"}\nRequest: ${query}`,
        },
      ],
    },
  ];

  for (let step = 0; step < maxToolCalls; step += 1) {
    const llm = await callGemini({ contents, tools });
    const candidate = llm?.candidates?.[0];
    const modelContent = candidate?.content;
    const parts = modelContent?.parts || [];

    if (!parts.length) {
      const err = new Error("AI response was empty");
      err.statusCode = 502;
      throw err;
    }

    contents.push({
      role: modelContent?.role || "model",
      parts,
    });

    const functionCalls = parts
      .filter((part) => part?.functionCall?.name)
      .map((part) => part.functionCall);

    if (!functionCalls.length) {
      const text = parts.map((part) => part?.text || "").join("\n").trim();
      return {
        answer: text || "No response generated.",
        toolsUsed,
        toolResults,
        model: llm?.modelVersion || geminiModel,
      };
    }

    for (const call of functionCalls) {
      const toolName = call.name;
      const toolArgs = safeParseToolArgs(call.args);
      const result = await callMcpTool({ authHeader, toolName, args: toolArgs });
      toolsUsed.push({ toolName, args: toolArgs });
      toolResults.push({ toolName, args: toolArgs, result });

      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: toolName,
              response: result,
            },
          },
        ],
      });
    }
  }

  return {
    answer: "I reached tool-call limit before finalizing the response.",
    toolsUsed,
    toolResults,
    model: geminiModel,
  };
};

export const runAiAssistantQuery = async ({ query, authHeader, user }) => {
  const { aiProvider } = getAiConfig();
  if (aiProvider === "gemini") {
    return runWithGemini({ query, authHeader, user });
  }
  return runWithOpenAI({ query, authHeader, user });
};

const parseQueryTimeframe = (query) => {
  const text = String(query || "").toLowerCase();
  const hoursMatch = text.match(/(\d+)\s*(hour|hours|hr|hrs)\b/);
  if (hoursMatch) return `${Number(hoursMatch[1])}h`;

  const daysMatch = text.match(/(\d+)\s*(day|days)\b/);
  if (daysMatch) return `${Number(daysMatch[1])}d`;

  const weeksMatch = text.match(/(\d+)\s*(week|weeks)\b/);
  if (weeksMatch) return `${Number(weeksMatch[1]) * 7}d`;

  if (text.includes("today")) return "24h";
  if (text.includes("yesterday")) return "48h";
  if (text.includes("this week") || text.includes("past week")) return "7d";
  return "7d";
};

const parseEventTypeForQuery = (query) => {
  const text = String(query || "").toLowerCase();
  const asksFailed = text.includes("failed");
  const asksLogin = text.includes("login") || text.includes("auth");
  if (asksFailed && asksLogin && text.includes("admin")) return "ADMIN_LOGIN_FAILED";
  if (asksFailed && asksLogin && text.includes("user")) return "LOGIN_FAILED";
  if (asksFailed && asksLogin) return "failed login";
  if (text.includes("admin login success")) return "ADMIN_LOGIN_SUCCESS";
  if (text.includes("login success")) return "LOGIN_SUCCESS";
  return "";
};

export const buildQueryFallback = async ({ query, authHeader }) => {
  const timeframe = parseQueryTimeframe(query);
  const eventType = parseEventTypeForQuery(query);

  const logs = await callMcpTool({
    authHeader,
    toolName: "get_audit_logs",
    args: {
      timeframe,
      limit: 50,
      ...(eventType ? { eventType } : {}),
    },
  });

  const records = Array.isArray(logs?.data?.records) ? logs.data.records : [];
  const total = Number(logs?.data?.total || records.length || 0);
  const failedCount = records.filter((row) => isFailedLoginEvent(row?.eventType)).length;
  const uniqueIps = new Set(records.map((row) => row?.ipAddress).filter(Boolean)).size;

  return {
    answer: `Fallback query result for ${timeframe}: ${total} records found, ${failedCount} failed-login events, ${uniqueIps} unique IPs.`,
    toolsUsed: [
      {
        toolName: "get_audit_logs",
        args: { timeframe, limit: 50, ...(eventType ? { eventType } : {}) },
      },
    ],
    toolResults: [
      {
        toolName: "get_audit_logs",
        args: { timeframe, limit: 50, ...(eventType ? { eventType } : {}) },
        result: logs,
      },
    ],
    model: "fallback-query",
  };
};

export const buildThreatSummary = async ({ authHeader, user }) => {
  const [stats, highAlerts, logs] = await Promise.all([
    callMcpTool({ authHeader, toolName: "get_admin_stats", args: {} }),
    callMcpTool({
      authHeader,
      toolName: "get_alerts",
      args: { severity: "HIGH", status: "ACTIVE", limit: 20 },
    }),
    callMcpTool({
      authHeader,
      toolName: "get_audit_logs",
      args: { timeframe: "24h", limit: 40 },
    }),
  ]);

  const statsData = stats?.data?.stats || {};
  const compactAlerts = (highAlerts?.data?.alerts || []).slice(0, 10).map((alert) => ({
    id: alert?._id,
    type: alert?.type,
    severity: alert?.severity,
    status: alert?.status,
    occurrenceCount: alert?.occurrenceCount,
    email: alert?.email || null,
    ipAddress: alert?.ipAddress || null,
    createdAt: alert?.createdAt,
  }));
  const compactLogs = (logs?.data?.records || []).slice(0, 20).map((event) => ({
    id: event?._id,
    eventType: event?.eventType,
    ipAddress: event?.ipAddress,
    createdAt: event?.createdAt,
  }));

  const prompt = [
    "You are a SOC analyst.",
    "Return strict JSON only with keys: summary, risk_level, recommendations.",
    "risk_level must be one of LOW|MEDIUM|HIGH|CRITICAL.",
    "recommendations must be an array of actionable strings.",
    `User role: ${user?.role || "unknown"}`,
    `Admin stats: ${JSON.stringify(statsData)}`,
    `High alerts (compact, max 10): ${JSON.stringify(compactAlerts)}`,
    `Recent logs (compact, max 20): ${JSON.stringify(compactLogs)}`,
  ].join("\n");

  try {
    const ai = await callProviderText({ prompt });
    const parsed = tryParseJson(ai.text) || {};

    return {
      summary:
        typeof parsed.summary === "string" && parsed.summary.trim()
          ? parsed.summary.trim()
          : "Security activity analyzed for the last 24 hours. Review alerts and failed login anomalies.",
      risk_level: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(parsed.risk_level)
        ? parsed.risk_level
        : "MEDIUM",
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations.slice(0, 10).map((x) => String(x))
        : ["Review high-severity active alerts.", "Investigate failed login spikes.", "Monitor suspicious IP activity."],
      toolsUsed: [
        { toolName: "get_admin_stats", args: {} },
        { toolName: "get_alerts", args: { severity: "HIGH", status: "ACTIVE", limit: 20 } },
        { toolName: "get_audit_logs", args: { timeframe: "24h", limit: 40 } },
      ],
      model: ai.model,
    };
  } catch (_error) {
    const failures = Number(statsData.loginFailures || 0);
    const activeAlerts = Number(statsData.recentAlerts || 0);
    const inferredRisk =
      activeAlerts >= 5 || failures >= 25 ? "HIGH" : activeAlerts >= 2 || failures >= 10 ? "MEDIUM" : "LOW";

    return {
      summary: `Fallback summary: ${statsData.totalEvents || 0} events in scope, ${failures} failed logins, and ${activeAlerts} active alerts.`,
      risk_level: inferredRisk,
      recommendations: [
        "Review unresolved high-severity alerts first.",
        "Investigate repeated failed-login patterns by IP and account.",
        "Apply temporary blocks or step-up authentication for suspicious actors.",
      ],
      toolsUsed: [
        { toolName: "get_admin_stats", args: {} },
        { toolName: "get_alerts", args: { severity: "HIGH", status: "ACTIVE", limit: 20 } },
        { toolName: "get_audit_logs", args: { timeframe: "24h", limit: 40 } },
      ],
      model: "fallback-summary",
    };
  }
};

export const triageAlertWithAi = async ({ authHeader, user, alertId, approveResolution, req }) => {
  const alertFetch = await callMcpTool({
    authHeader,
    toolName: "get_alerts",
    args: { alertId, limit: 1 },
  });

  const alert = alertFetch?.data?.alerts?.[0];
  if (!alert) {
    const err = new Error("Alert not found");
    err.statusCode = 404;
    throw err;
  }

  const auditLogContext = await callMcpTool({
    authHeader,
    toolName: "get_audit_logs",
    args: {
      timeframe: "24h",
      limit: 60,
      ...(alert?.ipAddress ? { ipAddress: alert.ipAddress } : {}),
    },
  });

  const auditRecords = Array.isArray(auditLogContext?.data?.records)
    ? auditLogContext.data.records
    : [];
  const compactAuditRecords = auditRecords.slice(0, 20).map((event) => ({
    id: event?._id,
    eventType: event?.eventType,
    ipAddress: event?.ipAddress || "",
    email: event?.metadata?.email || "",
    createdAt: event?.createdAt,
  }));

  const prompt = [
    "You are a security triage assistant.",
    "Return strict JSON only with keys: severity_classification, explanation, recommended_action, should_resolve.",
    "severity_classification must be LOW|MEDIUM|HIGH|CRITICAL.",
    "should_resolve must be true/false.",
    `Alert payload: ${JSON.stringify(alert)}`,
    `Recent related audit logs (24h): ${JSON.stringify(compactAuditRecords)}`,
  ].join("\n");

  const ai = await callProviderText({ prompt });
  const parsed = tryParseJson(ai.text) || {};

  const relatedCount = compactAuditRecords.length;
  const failedRelatedCount = compactAuditRecords.filter((row) =>
    String(row?.eventType || "").toUpperCase().includes("FAILED")
  ).length;
  const dynamicExplanation = [
    `${String(alert?.type || "ALERT").replaceAll("_", " ")} observed for ${alert?.email || alert?.ipAddress || "target"}.`,
    `Severity ${String(alert?.severity || "MEDIUM")} with occurrence count ${Number(alert?.occurrenceCount || 1)}.`,
    `Related audit logs in last 24h: ${relatedCount}${relatedCount ? `, failed entries: ${failedRelatedCount}` : ""}.`,
  ].join(" ");

  const dynamicAction = (() => {
    const type = String(alert?.type || "").toUpperCase();
    if (type.includes("IP_BRUTE_FORCE")) {
      return "Temporarily block the source IP, enforce rate-limits, and review accounts targeted by repeated failures.";
    }
    if (type.includes("FAILED_LOGIN_THRESHOLD")) {
      return "Enable step-up authentication for the account and verify whether failures are user error or credential stuffing.";
    }
    if (type.includes("GEO_ANOMALY")) {
      return "Validate user travel context, revoke suspicious sessions, and require re-authentication from trusted locations.";
    }
    if (type.includes("NEW_DEVICE_LOGIN")) {
      return "Confirm device ownership with the user and monitor subsequent actions from this device for escalation signals.";
    }
    return "Correlate with recent logs, validate affected identity/IP, and resolve only after evidence confirms benign behavior.";
  })();

  const isGenericText = (value = "") => {
    const text = String(value || "").trim().toLowerCase();
    if (!text) return true;
    const genericPatterns = [
      "triage completed from current alert context",
      "investigate related logs and affected account/ip before resolving",
      "review and investigate",
      "check the logs",
      "monitor the alert",
    ];
    return genericPatterns.some((pattern) => text.includes(pattern)) || text.length < 40;
  };

  const triage = {
    severity_classification: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(parsed.severity_classification)
      ? parsed.severity_classification
      : alert.severity || "MEDIUM",
    explanation:
      typeof parsed.explanation === "string" && parsed.explanation.trim()
        ? parsed.explanation.trim()
        : dynamicExplanation,
    recommended_action:
      typeof parsed.recommended_action === "string" && parsed.recommended_action.trim()
        ? parsed.recommended_action.trim()
        : dynamicAction,
    should_resolve: Boolean(parsed.should_resolve),
  };

  if (isGenericText(triage.explanation)) {
    triage.explanation = dynamicExplanation;
  }
  if (isGenericText(triage.recommended_action)) {
    triage.recommended_action = dynamicAction;
  }

  let resolution = null;
  if (approveResolution === true) {
    if (user?.role !== "admin") {
      const err = new Error("Admin role is required to resolve alerts");
      err.statusCode = 403;
      throw err;
    }
    resolution = await callMcpTool({
      authHeader,
      toolName: "resolve_alert",
      args: { alertId },
    });
  }

  const { logEvent } = await import("../controllers/event.controller.js");
  await logEvent("AI_ALERT_TRIAGE_DECISION", {
    req,
    userId: user?._id || null,
    data: {
      alertId,
      triage,
      approveResolution: Boolean(approveResolution),
      resolved: Boolean(resolution),
    },
  });

  return {
    alert,
    triage,
    resolved: resolution?.data?.alert || null,
    toolsUsed: [
      { toolName: "get_alerts", args: { alertId, limit: 1 } },
      {
        toolName: "get_audit_logs",
        args: {
          timeframe: "24h",
          limit: 60,
          ...(alert?.ipAddress ? { ipAddress: alert.ipAddress } : {}),
        },
      },
      ...(resolution ? [{ toolName: "resolve_alert", args: { alertId } }] : []),
    ],
    model: ai.model,
  };
};

const isFailedLoginEvent = (eventType) => {
  const value = String(eventType || "").toUpperCase();
  return value.includes("LOGIN_FAILED") || value.includes("ADMIN_LOGIN_FAILED");
};

const toDayKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const buildFailedLoginTrend = (records = [], predicate = () => true, label = "Failed Logins") => {
  const byDay = new Map();
  records.forEach((record) => {
    if (!predicate(record)) return;
    const dayKey = toDayKey(record?.createdAt);
    if (!dayKey) return;
    byDay.set(dayKey, (byDay.get(dayKey) || 0) + 1);
  });
  const labels = [...byDay.keys()].sort((a, b) => new Date(a) - new Date(b));
  const data = labels.map((label) => byDay.get(label) || 0);
  return { labels, data, label };
};

const parseInsightTimeframe = (query) => {
  const text = String(query || "").toLowerCase();
  const hoursMatch = text.match(/(\d+)\s*(hour|hours|hr|hrs)\b/);
  if (hoursMatch) return `${Number(hoursMatch[1])}h`;

  const daysMatch = text.match(/(\d+)\s*(day|days)\b/);
  if (daysMatch) return `${Number(daysMatch[1])}d`;

  const weeksMatch = text.match(/(\d+)\s*(week|weeks)\b/);
  if (weeksMatch) return `${Number(weeksMatch[1]) * 7}d`;

  if (text.includes("today")) return "24h";
  if (text.includes("this week") || text.includes("weekly")) return "7d";
  if (text.includes("last week")) return "7d";
  if (text.includes("month")) return "30d";
  return "7d";
};

const detectInsightIntent = (query) => {
  const text = String(query || "").toLowerCase();
  if (text.includes("event type") || text.includes("distribution") || text.includes("increased most")) {
    return "event_distribution";
  }
  if (text.includes("alert pressure") || text.includes("active alert") || text.includes("alerts")) {
    return "alert_pressure";
  }
  if (
    text.includes("failed login") ||
    text.includes("login failure") ||
    text.includes("authentication failure") ||
    text.includes("auth failure")
  ) {
    return "auth_failures";
  }
  if (text.includes("anomaly") || text.includes("suspicious")) {
    return "anomaly";
  }
  if (text.includes("trend")) {
    return "trend";
  }
  return "overview";
};

const getFailedLoginScope = (query) => {
  const text = String(query || "").toLowerCase();
  if (text.includes("admin")) return "admin";
  if (text.includes("user")) return "user";
  return "any";
};

const matchesFailedScope = (record, scope) => {
  const eventType = String(record?.eventType || "").toUpperCase();
  if (scope === "admin") return eventType.includes("ADMIN_LOGIN_FAILED");
  if (scope === "user") return eventType === "LOGIN_FAILED";
  return isFailedLoginEvent(eventType);
};

const toTopPairs = (countsMap, limit = 5, fallbackLabel = "NO_DATA") => {
  const pairs = Object.entries(countsMap).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, limit);
  return pairs.length ? pairs : [[fallbackLabel, 0]];
};

export const buildInsightCards = async ({ authHeader, user, query }) => {
  const timeframe = parseInsightTimeframe(query);
  const intent = detectInsightIntent(query);
  const failedScope = getFailedLoginScope(query);

  const [stats, alerts, logs] = await Promise.all([
    callMcpTool({ authHeader, toolName: "get_admin_stats", args: {} }),
    callMcpTool({
      authHeader,
      toolName: "get_alerts",
      args: { status: "ACTIVE", limit: 50 },
    }),
    callMcpTool({
      authHeader,
      toolName: "get_audit_logs",
      args: { timeframe, limit: 100 },
    }),
  ]);

  const statsData = stats?.data?.stats || {};
  const alertRows = Array.isArray(alerts?.data?.alerts) ? alerts.data.alerts : [];
  const logRows = Array.isArray(logs?.data?.records) ? logs.data.records : [];
  const scopedFailedRows = logRows.filter((record) => matchesFailedScope(record, failedScope));
  const failedLoginCount = scopedFailedRows.length;

  const eventTypeCounts = logRows.reduce((acc, row) => {
    const key = String(row?.eventType || "UNKNOWN");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const severityCounts = alertRows.reduce((acc, row) => {
    const key = String(row?.severity || "UNKNOWN").toUpperCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const topFailedIps = scopedFailedRows.reduce((acc, row) => {
    const key = String(row?.ipAddress || "UNKNOWN");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const safeTopEventTypes = toTopPairs(eventTypeCounts, 5, "NO_EVENTS");
  const safeTopSeverities = toTopPairs(severityCounts, 5, "NO_ALERTS");
  const safeTopFailedIps = toTopPairs(topFailedIps, 5, "NO_FAILED_IP");

  const trend = buildFailedLoginTrend(
    logRows,
    (record) => matchesFailedScope(record, failedScope),
    failedScope === "admin" ? "Failed Admin Logins" : failedScope === "user" ? "Failed User Logins" : "Failed Logins"
  );
  const hasTrendData = trend.labels.length > 0 && trend.data.some((value) => Number(value) > 0);

  const buildIntentChart = () => {
    if (intent === "event_distribution") {
      return {
        suggestedChart: {
          type: "bar",
          title: `Top Event Types (${timeframe})`,
          reason: "Bar chart clearly compares event volume by type.",
        },
        chartData: {
          labels: safeTopEventTypes.map(([name]) => name),
          datasets: [{ label: "Event Count", data: safeTopEventTypes.map(([, count]) => Number(count || 0)) }],
        },
      };
    }

    if (intent === "alert_pressure") {
      return {
        suggestedChart: {
          type: "doughnut",
          title: "Active Alert Severity Mix",
          reason: "Doughnut chart highlights alert pressure split by severity.",
        },
        chartData: {
          labels: safeTopSeverities.map(([name]) => name),
          datasets: [{ label: "Active Alerts", data: safeTopSeverities.map(([, count]) => Number(count || 0)) }],
        },
      };
    }

    if (intent === "anomaly") {
      return {
        suggestedChart: {
          type: "bar",
          title: `Top Failed-Login Source IPs (${timeframe})`,
          reason: "Concentrated failed attempts by IP indicate suspicious patterns.",
        },
        chartData: {
          labels: safeTopFailedIps.map(([name]) => name),
          datasets: [{ label: "Failed Attempts", data: safeTopFailedIps.map(([, count]) => Number(count || 0)) }],
        },
      };
    }

    if (intent === "auth_failures" || intent === "trend") {
      if (hasTrendData) {
        return {
          suggestedChart: {
            type: "line",
            title: `${trend.label} Trend (${timeframe})`,
            reason: "Line chart best shows login-failure spikes over time.",
          },
          chartData: {
            labels: trend.labels,
            datasets: [{ label: trend.label, data: trend.data }],
          },
        };
      }
      return {
        suggestedChart: {
          type: "bar",
          title: `Top Event Types (${timeframe})`,
          reason: "No failed-login trend points; showing dominant event pattern instead.",
        },
        chartData: {
          labels: safeTopEventTypes.map(([name]) => name),
          datasets: [{ label: "Event Count", data: safeTopEventTypes.map(([, count]) => Number(count || 0)) }],
        },
      };
    }

    return hasTrendData
      ? {
          suggestedChart: {
            type: "line",
            title: `Failed Login Trend (${timeframe})`,
            reason: "Trend line highlights overall authentication risk movement.",
          },
          chartData: {
            labels: trend.labels,
            datasets: [{ label: "Failed Logins", data: trend.data }],
          },
        }
      : {
          suggestedChart: {
            type: "bar",
            title: `Top Event Types (${timeframe})`,
            reason: "No failed-login trend points found; showing event mix.",
          },
          chartData: {
            labels: safeTopEventTypes.map(([name]) => name),
            datasets: [{ label: "Event Count", data: safeTopEventTypes.map(([, count]) => Number(count || 0)) }],
          },
        };
  };

  const intentChart = buildIntentChart();
  const fallbackChart = intentChart.suggestedChart;
  const chartData = intentChart.chartData;

  const fallbackFindingsByIntent = {
    auth_failures: [
      `Detected ${failedLoginCount} ${failedScope === "admin" ? "admin" : failedScope === "user" ? "user" : ""} failed login attempts in ${timeframe}.`.replace(/\s+/g, " "),
      `${statsData.recentAlerts || 0} active alerts are currently open.`,
      `Most frequent failed-login source: ${safeTopFailedIps[0][0]} (${safeTopFailedIps[0][1]} attempts).`,
    ],
    trend: [
      `Authentication failures trend analyzed over ${timeframe}.`,
      `${failedLoginCount} failed login attempts were observed in the selected scope.`,
      `${statsData.totalEvents || 0} total events provide baseline context for trend interpretation.`,
    ],
    event_distribution: [
      `Event distribution analyzed over ${timeframe}.`,
      `Top event: ${safeTopEventTypes[0][0]} (${safeTopEventTypes[0][1]} occurrences).`,
      `${statsData.totalEvents || 0} total events are included in this distribution snapshot.`,
    ],
    alert_pressure: [
      `${alertRows.length} active alerts are currently contributing to alert pressure.`,
      `Highest alert severity bucket: ${safeTopSeverities[0][0]} (${safeTopSeverities[0][1]} alerts).`,
      `Use severity mix with login trend to prioritize response order.`,
    ],
    anomaly: [
      `Suspicious pattern scan completed for ${timeframe}.`,
      `${failedLoginCount} failed logins found; concentration by source IP reviewed.`,
      `Top suspicious source candidate: ${safeTopFailedIps[0][0]}.`,
    ],
    overview: [
      `Observed ${statsData.totalEvents || 0} events across ${timeframe}.`,
      `${failedLoginCount} failed login attempts were detected in the selected period.`,
      `${alertRows.length} alerts are currently active and require tracking.`,
    ],
  };
  const fallbackFindings = fallbackFindingsByIntent[intent] || fallbackFindingsByIntent.overview;

  const compactContext = {
    query: String(query || "").slice(0, 300),
    intent,
    timeframe,
    stats: statsData,
    activeAlerts: alertRows.slice(0, 20).map((item) => ({
      id: item?._id,
      severity: item?.severity,
      type: item?.type,
      count: item?.occurrenceCount,
    })),
    topEventTypes: safeTopEventTypes,
    alertSeverityMix: safeTopSeverities,
    topFailedIps: safeTopFailedIps,
    failedTrend: {
      labels: trend.labels,
      data: trend.data,
    },
  };

  const prompt = [
    "You are a SOC insights assistant.",
    "Return strict JSON only with keys: findings, suggested_chart.",
    "findings must be an array with exactly 3 concise strings.",
    "suggested_chart must include keys: type, title, reason.",
    "type must be one of: line, bar, doughnut.",
    `User role: ${user?.role || "unknown"}`,
    `Context: ${JSON.stringify(compactContext)}`,
  ].join("\n");

  try {
    const ai = await callProviderText({ prompt });
    const parsed = tryParseJson(ai.text) || {};
    const findings = Array.isArray(parsed?.findings)
      ? parsed.findings.slice(0, 3).map((value) => String(value))
      : fallbackFindings;
    const chartType = String(parsed?.suggested_chart?.type || fallbackChart.type).toLowerCase();
    const safeType = ["line", "bar", "doughnut"].includes(chartType) ? chartType : "line";

    return {
      findings,
      suggestedChart: {
        type: safeType,
        title:
          typeof parsed?.suggested_chart?.title === "string" && parsed.suggested_chart.title.trim()
            ? parsed.suggested_chart.title.trim()
            : fallbackChart.title,
        reason:
          typeof parsed?.suggested_chart?.reason === "string" && parsed.suggested_chart.reason.trim()
            ? parsed.suggested_chart.reason.trim()
            : fallbackChart.reason,
      },
      chartData,
      toolsUsed: [
        { toolName: "get_admin_stats", args: {} },
        { toolName: "get_alerts", args: { status: "ACTIVE", limit: 50 } },
        { toolName: "get_audit_logs", args: { timeframe, limit: 100 } },
      ],
      model: ai.model,
    };
  } catch (_error) {
    return {
      findings: fallbackFindings,
      suggestedChart: fallbackChart,
      chartData,
      toolsUsed: [
        { toolName: "get_admin_stats", args: {} },
        { toolName: "get_alerts", args: { status: "ACTIVE", limit: 50 } },
        { toolName: "get_audit_logs", args: { timeframe, limit: 100 } },
      ],
      model: "fallback-insight-cards",
    };
  }
};
