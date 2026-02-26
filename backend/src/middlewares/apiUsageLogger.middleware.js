import ApiLog from "../models/apiLog.model.js";

const apiUsageLogger = (req, res, next) => {
  const startedAt = Date.now();

  res.on("finish", async () => {
    try {
      if (!req.originalUrl.startsWith("/api")) return;

      const ipAddress =
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.ip ||
        req.socket?.remoteAddress ||
        "0.0.0.0";

      await ApiLog.create({
        endpoint: req.originalUrl,
        method: req.method,
        responseStatus: res.statusCode,
        responseTimeMs: Date.now() - startedAt,
        ipAddress,
        userId: req.user?._id || null,
      });
    } catch (error) {
      console.error("API usage logger failed:", error.message);
    }
  });

  next();
};

export default apiUsageLogger;
