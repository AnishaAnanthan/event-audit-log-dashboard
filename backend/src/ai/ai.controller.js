import mongoose from "mongoose";
import {
  buildQueryFallback,
  buildInsightCards,
  buildThreatSummary,
  runAiAssistantQuery,
  triageAlertWithAi,
} from "./ai.service.js";

const MAX_QUERY_LENGTH = Number(process.env.AI_MAX_INPUT_CHARS || 2000);

export const queryAssistant = async (req, res, next) => {
  try {
    const query = req.body?.query;
    if (typeof query !== "string" || !query.trim()) {
      return res.status(400).json({ message: "query is required" });
    }

    if (query.length > MAX_QUERY_LENGTH) {
      return res
        .status(400)
        .json({ message: `query too long. max ${MAX_QUERY_LENGTH} characters` });
    }

    const authHeader = req.headers.authorization;
    let result;
    try {
      result = await runAiAssistantQuery({
        query: query.trim(),
        authHeader,
        user: req.user,
      });
    } catch (_error) {
      result = await buildQueryFallback({
        query: query.trim(),
        authHeader,
      });
    }

    const auditToolResult = (result.toolResults || [])
      .slice()
      .reverse()
      .find((item) => item.toolName === "get_audit_logs");
    const auditData = auditToolResult?.result?.data || null;

    return res.json({
      response: result.answer,
      toolsUsed: result.toolsUsed,
      data: auditData,
      explanation: result.answer,
      riskInterpretation:
        "Review failed logins, repeated IP activity, and unresolved alerts from the returned data to assess risk escalation.",
      model: result.model,
    });
  } catch (error) {
    return next(error);
  }
};

export const getThreatSummary = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const result = await buildThreatSummary({
      authHeader,
      user: req.user,
    });

    return res.json({
      summary: result.summary,
      risk_level: result.risk_level,
      recommendations: result.recommendations,
      toolsUsed: result.toolsUsed,
      model: result.model,
    });
  } catch (error) {
    return next(error);
  }
};

export const triageAlert = async (req, res, next) => {
  try {
    const { alertId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(alertId || "")) {
      return res.status(400).json({ message: "Invalid alert id" });
    }

    const approveResolution = req.body?.approveResolution === true;
    const authHeader = req.headers.authorization;
    const result = await triageAlertWithAi({
      authHeader,
      user: req.user,
      alertId,
      approveResolution,
      req,
    });

    return res.json({
      alert: result.alert,
      triage: result.triage,
      resolved: result.resolved,
      toolsUsed: result.toolsUsed,
      model: result.model,
    });
  } catch (error) {
    return next(error);
  }
};

export const getInsightCards = async (req, res, next) => {
  try {
    const query = String(req.body?.query || "Show risk spikes this week.").trim().slice(0, MAX_QUERY_LENGTH);
    const authHeader = req.headers.authorization;

    const result = await buildInsightCards({
      authHeader,
      user: req.user,
      query,
    });

    return res.json(result);
  } catch (error) {
    return next(error);
  }
};
