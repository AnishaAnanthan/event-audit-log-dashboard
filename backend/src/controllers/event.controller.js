import Event from '../models/event.model.js';
import ImportedEvent from '../models/importedEvent.model.js';
import Alert from '../models/alert.model.js';
import User from '../models/user.model.js';
import ApiLog from '../models/apiLog.model.js';
import getGeoLocation from '../services/geoIp.service.js';

// Helper to create or update alert (Deduplication & Escalation)
export const triggerAlert = async (data) => {
  const { type, severity, email, ipAddress, message } = data;
  
  // Find active alert of same type for same target
  const query = { type, status: "ACTIVE" };
  if (email) query.email = email;
  if (ipAddress) query.ipAddress = ipAddress;

  const existingAlert = await Alert.findOne(query);

  if (existingAlert) {
    existingAlert.occurrenceCount += 1;
    existingAlert.lastTriggeredAt = new Date();
    existingAlert.message = message; // Update message with latest info
    existingAlert.updatedBy = "system";
    
    // Severity Escalation Logic
    if (existingAlert.occurrenceCount >= 5 && existingAlert.severity === 'LOW') existingAlert.severity = 'MEDIUM';
    if (existingAlert.occurrenceCount >= 10 && existingAlert.severity === 'MEDIUM') existingAlert.severity = 'HIGH';
    if (existingAlert.occurrenceCount >= 20 && existingAlert.severity === 'HIGH') existingAlert.severity = 'CRITICAL';
    
    await existingAlert.save();
  } else {
    await Alert.create({
      type,
      severity,
      email,
      ipAddress,
      message,
      occurrenceCount: 1,
      lastTriggeredAt: new Date(),
      createdBy: "system",
      updatedBy: "system",
    });
  }
};

export const logEvent = async (eventType, details = {}) => {
  try {
    const { req, userId, data, error } = details;
    
    // Robust IP extraction to prevent validation errors
    const ipAddress = (req?.headers?.['x-forwarded-for']?.split(',')[0]) || req?.ip || req?.socket?.remoteAddress || '0.0.0.0';

    // Support both _id and userId to prevent logic breakage
    const finalUserId = userId || req?.user?._id || req?.user?.userId || null;
    const geoLocation = await getGeoLocation(ipAddress);

    const event = new Event({
      eventType,
      userId: finalUserId,
      ipAddress,
      geoLocation: geoLocation || undefined,
      endpoint: req?.originalUrl,
      method: req?.method,
      createdBy: req?.user?.role || 'system',
      updatedBy: req?.user?.role || 'system',
      // In a real app, you'd resolve geo-location here
      // geoLocation: await getGeoFromIp(req.ip),
      metadata: {
        browser: req?.headers?.['user-agent'],
        ...data, // Spread the data object directly into metadata
        error: error ? { message: String(error) } : undefined,
      },
    });
    await event.save();
    console.log(`[LogEvent] Saved: ${eventType} | User: ${finalUserId} | IP: ${ipAddress}`);

    // Trigger Alert Check on Failed Login
    if (['LOGIN_FAILED', 'ADMIN_LOGIN_FAILED'].includes(eventType) && data?.email && ipAddress) {
      await checkAlertThresholds(ipAddress, data.email);
    }

    // Geo Anomaly Check (if email and location exist)
    if (data?.email && event.geoLocation) {
      await checkGeoAnomaly(data.email, event.geoLocation, ipAddress);
    }

  } catch (saveError) {
    console.error('Failed to log event:', saveError);
  }
};

const checkAlertThresholds = async (ip, email) => {
  const windowMinutes = 10;
  const sinceTime = new Date(Date.now() - windowMinutes * 60 * 1000);

  // 1. Failed Login Threshold (Same Email)
  if (email) {
    const failedCount = await Event.countDocuments({
      eventType: { $in: ['LOGIN_FAILED', 'ADMIN_LOGIN_FAILED'] },
      'metadata.email': email, // Query the flattened structure
      createdAt: { $gte: sinceTime }
    });

    if (failedCount >= 5) {
      await triggerAlert({
        type: "FAILED_LOGIN_THRESHOLD",
        severity: "HIGH",
        email,
        ipAddress: ip,
        message: `User ${email} failed to login ${failedCount} times in the last ${windowMinutes} minutes.`
      });
      await updateRiskScore(email, 10);
    }
  }

  // 2. IP Brute Force (Same IP, Multiple Accounts)
  if (ip) {
    const distinctUsers = await Event.distinct("metadata.email", { // Query the flattened structure
      eventType: { $in: ['LOGIN_FAILED', 'ADMIN_LOGIN_FAILED'] },
      ipAddress: ip,
      createdAt: { $gte: sinceTime }
    });

    if (distinctUsers.length >= 5) {
      await triggerAlert({
        type: "IP_BRUTE_FORCE",
        severity: "CRITICAL",
        ipAddress: ip,
        message: `Suspicious activity from IP ${ip}: Attempted login on ${distinctUsers.length} different accounts.`
      });
    }
  }
};

const checkGeoAnomaly = async (email, currentGeo, ip) => {
  const isLocalIp = (value = "") => {
    const normalized = String(value || "").replace("::ffff:", "").trim();
    return (
      !normalized ||
      normalized === "127.0.0.1" ||
      normalized === "::1" ||
      normalized.startsWith("192.168.") ||
      normalized.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)
    );
  };

  // Fetch the last event for this user (skipping the one we just saved)
  const lastEvent = await Event.findOne({ 
      'metadata.email': email,
      eventType: { $in: ["LOGIN_SUCCESS", "ADMIN_LOGIN_SUCCESS", "GOOGLE_LOGIN_SUCCESS", "ADMIN_GOOGLE_LOGIN_SUCCESS"] },
      ipAddress: { $exists: true, $ne: "" },
  }).sort({ createdAt: -1 }).skip(1);

  const currentCountry = String(currentGeo?.country || "").toUpperCase();
  const previousCountry = String(lastEvent?.geoLocation?.country || "").toUpperCase();
  const currentIp = String(ip || "");
  const previousIp = String(lastEvent?.ipAddress || "");
  const hasCountryJump =
    currentCountry &&
    previousCountry &&
    currentCountry !== previousCountry;
  const hasPublicIpJump =
    currentIp &&
    previousIp &&
    currentIp !== previousIp &&
    !isLocalIp(currentIp) &&
    !isLocalIp(previousIp);

  if (lastEvent && (hasCountryJump || hasPublicIpJump)) {
      const timeDiff = (new Date() - new Date(lastEvent.createdAt)) / 1000 / 60; // minutes
      if (timeDiff < 5) {
          const jumpText = hasCountryJump
            ? `from ${currentCountry} within ${Math.round(timeDiff)} mins of login from ${previousCountry}`
            : `between IPs ${previousIp} and ${currentIp} within ${Math.round(timeDiff)} mins`;
          await triggerAlert({
              type: "GEO_ANOMALY",
              severity: "MEDIUM",
              email,
              ipAddress: ip,
              message: `Impossible travel pattern detected: Login ${jumpText}.`
          });
          await updateRiskScore(email, 20);
      }
  }
};

export const updateRiskScore = async (email, points) => {
  await User.findOneAndUpdate({ email }, { $inc: { riskScore: points } });
  // Logic to trigger HIGH_RISK alert if score >= 50 can go here
};

export const getAdminStats = async (req, res) => {
    try {
      const totalEvents = await Event.countDocuments();
      const loginFailures = await Event.countDocuments({ eventType: { $in: ['LOGIN_FAILED', 'ADMIN_LOGIN_FAILED'] } });
      
      const uniqueUsers = await Event.distinct('userId');

      // Now fetching real alerts from Alert model
      const activeAlerts = await Alert.countDocuments({ status: 'ACTIVE' });
  
      res.json({
        totalEvents,
        loginFailures,
        uniqueUsers: uniqueUsers.length,
        recentAlerts: activeAlerts
      });
    } catch (error) {
      res.status(500).json({ message: 'Error fetching admin stats' });
    }
};

export const getAllEvents = async (req, res) => {
    try {
        const {
          page = 1,
          limit = 25,
          eventType,
          ipAddress,
          startDate,
          endDate,
          scope = "ALL",
          importSessionId,
        } = req.query;
        const isImportQuery = Boolean(importSessionId);
        const EventModel = isImportQuery ? ImportedEvent : Event;
        const query = {};
        const andConditions = [];

        if (eventType) query.eventType = { $regex: eventType, $options: 'i' };
        if (ipAddress) query.ipAddress = ipAddress;
        if (importSessionId) query["metadata.importSessionId"] = String(importSessionId);
        if (startDate) query.createdAt = { ...query.createdAt, $gte: new Date(startDate) };
        if (endDate) {
            const end = new Date(endDate);
            end.setUTCHours(23, 59, 59, 999);
            query.createdAt = { ...query.createdAt, $lte: end };
        }

        const normalizedScope = String(scope || "ALL").toUpperCase();
        if (normalizedScope === "ADMIN") {
          andConditions.push({ eventType: { $regex: /^ADMIN_/ } });
        } else if (normalizedScope === "USER") {
          andConditions.push({ eventType: { $not: /^ADMIN_/ } });
        }

        if (andConditions.length) {
          query.$and = andConditions;
        }

        const pageNumber = Math.max(1, Number(page) || 1);
        const pageSize = Math.max(1, Number(limit) || 25);

        const events = await EventModel.find(query)
            .populate("userId", "name email")
            .sort({ createdAt: -1 })
            .limit(pageSize)
            .skip((pageNumber - 1) * pageSize)
            .exec();

        const normalizedEvents = events.map((event) => {
          const eventObj = event.toObject();
          const userNameFromRef = eventObj?.userId?.name;
          const userNameFromMeta = eventObj?.metadata?.email;
          return {
            ...eventObj,
            userName: userNameFromRef || userNameFromMeta || "System",
          };
        });

        const count = await EventModel.countDocuments(query);

        res.json({
            events: normalizedEvents,
            totalPages: Math.max(1, Math.ceil(count / pageSize)),
            currentPage: pageNumber
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching events' });
    }
};

const deriveEventStatus = (eventType = "", level = "") => {
  const type = String(eventType || "").toUpperCase();
  const lvl = String(level || "").toUpperCase();
  if (type.includes("FAILED") || type.includes("ERROR") || type.includes("CRITICAL")) return "FAILED";
  if (lvl === "HIGH" || lvl === "CRITICAL" || lvl === "ERROR") return "FAILED";
  return "SUCCESS";
};

export const getImportedSessionProfile = async (req, res) => {
  try {
    const { importSessionId, startDate, endDate } = req.query;
    if (!importSessionId) {
      return res.status(400).json({ message: "importSessionId is required" });
    }

    const query = { "metadata.importSessionId": String(importSessionId) };
    if (startDate) query.createdAt = { ...query.createdAt, $gte: new Date(startDate) };
    if (endDate) {
      const end = new Date(endDate);
      end.setUTCHours(23, 59, 59, 999);
      query.createdAt = { ...query.createdAt, $lte: end };
    }

    const docs = await ImportedEvent.find(query).select("eventType metadata").lean();
    const totalEvents = docs.length;

    const fieldMap = new Map();
    const topMap = new Map();
    const eventTypeMap = new Map();
    const statusMap = new Map();
    const ignoredKeys = new Set([
      "browser",
      "rawLine",
      "message",
      "imported",
      "importTag",
      "importSessionId",
      "uploadedFileName",
      "sourceFile",
      "sourceSystem",
    ]);

    docs.forEach((doc) => {
      const type = String(doc?.eventType || "UNKNOWN_EVENT").toUpperCase();
      eventTypeMap.set(type, (eventTypeMap.get(type) || 0) + 1);

      const level = String(doc?.metadata?.level || "");
      const status = deriveEventStatus(type, level);
      statusMap.set(status, (statusMap.get(status) || 0) + 1);

      const metadata = doc?.metadata && typeof doc.metadata === "object" ? doc.metadata : {};
      Object.entries(metadata).forEach(([key, value]) => {
        if (!key || ignoredKeys.has(key)) return;
        if (value === null || value === undefined || value === "") return;

        const keyEntry = fieldMap.get(key) || { key, count: 0, values: new Map() };
        keyEntry.count += 1;
        const safeValue = String(value);
        keyEntry.values.set(safeValue, (keyEntry.values.get(safeValue) || 0) + 1);
        fieldMap.set(key, keyEntry);
      });
    });

    const fieldCoverage = Array.from(fieldMap.values())
      .map((entry) => ({
        field: entry.key,
        count: entry.count,
        coverage: totalEvents ? Number(((entry.count / totalEvents) * 100).toFixed(2)) : 0,
        uniqueValues: entry.values.size,
      }))
      .sort((a, b) => b.count - a.count);

    fieldMap.forEach((entry, key) => {
      const topValues = Array.from(entry.values.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([value, count]) => ({ value, count }));
      topMap.set(key, topValues);
    });

    topMap.set(
      "eventType",
      Array.from(eventTypeMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([value, count]) => ({ value, count }))
    );
    topMap.set(
      "status",
      Array.from(statusMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({ value, count }))
    );

    const eventTypeVariety = eventTypeMap.size;
    const hasField = (name) => fieldMap.has(name) && (fieldMap.get(name)?.count || 0) > 0;

    const chartRecommendations = [];
    if (totalEvents === 0) {
      chartRecommendations.push({
        id: "empty",
        chartType: "empty",
        title: "No Data",
        reason: "No imported events match this session/date filter.",
      });
    } else if (eventTypeVariety <= 2) {
      if (hasField("processName")) {
        chartRecommendations.push({
          id: "top-process",
          chartType: "bar",
          field: "processName",
          title: "Top Processes",
          reason: "Event types are too limited; process distribution is more informative.",
        });
      }
      if (hasField("host")) {
        chartRecommendations.push({
          id: "top-host",
          chartType: "bar",
          field: "host",
          title: "Top Hosts",
          reason: "Low event-type variety; host concentration reveals signal.",
        });
      }
      chartRecommendations.push({
        id: "status-split",
        chartType: "donut",
        field: "status",
        title: "Status Split",
        reason: "Success vs failed split provides clearer insight for small event mixes.",
      });
    } else {
      chartRecommendations.push({
        id: "event-type-distribution",
        chartType: "pie",
        field: "eventType",
        title: "Event Type Distribution",
        reason: "Event-type variety is sufficient for distribution analysis.",
      });
      chartRecommendations.push({
        id: "status-split",
        chartType: "donut",
        field: "status",
        title: "Status Split",
        reason: "Status trend remains useful alongside event types.",
      });
    }

    return res.json({
      summary: {
        importSessionId: String(importSessionId),
        totalEvents,
        eventTypeVariety,
      },
      fieldCoverage,
      topValuesByField: Object.fromEntries(topMap.entries()),
      chartRecommendations,
    });
  } catch (_error) {
    return res.status(500).json({ message: "Error building imported session profile" });
  }
};

export const getEventVolume = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let start, end;

    if (startDate && endDate) {
      // Force UTC interpretation by appending time to prevent timezone drift
      start = new Date(`${startDate}T00:00:00.000Z`);
      end = new Date(`${endDate}T23:59:59.999Z`);
    } else {
      const now = new Date();
      end = new Date(now);
      end.setUTCHours(23, 59, 59, 999);
      
      start = new Date(now);
      start.setUTCDate(now.getUTCDate() - 6);
      start.setUTCHours(0, 0, 0, 0);
    }

    const volume = await Event.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    const volumeMap = new Map(volume.map(item => [item._id, item.count]));
    const labels = [];
    const data = [];
    
    // Calculate exact number of days covered
    const oneDay = 24 * 60 * 60 * 1000;
    const dayCount = Math.round((end - start) / oneDay);

    for (let i = 0; i < dayCount; i++) {
      // Use timestamp arithmetic to avoid calendar shifting issues
      const date = new Date(start.getTime() + i * oneDay);
      const dateString = date.toISOString().split('T')[0];
      labels.push(dateString);
      data.push(volumeMap.get(dateString) || 0);
    }

    res.json({ labels, data });
  } catch (error) {
    res.status(500).json({ message: "Error fetching event volume" });
  }
};

export const getEventDistribution = async (req, res) => {
  try {
    const distribution = await Event.aggregate([
      { $group: { _id: "$eventType", count: { $sum: 1 } } }
    ]);

    const labels = distribution.map(item => item._id);
    const data = distribution.map(item => item.count);

    res.json({ labels, data });
  } catch (error) {
    res.status(500).json({ message: "Error fetching event distribution" });
  }
};

export const getUserEvents = async (req, res) => {
  try {
    const userId = req.user._id || req.user.userId;
    const { page = 1, limit = 10 } = req.query;

    const events = await Event.find({ userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const count = await Event.countDocuments({ userId });

    res.json({
      events,
      totalPages: Math.ceil(count / limit),
      currentPage: Number(page)
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching user events" });
  }
};

export const getDashboardStats = async (req, res) => {
  try {
    const userId = req.user._id || req.user.userId;
    const userEmail = req.user.email;
    const failedFilter = {
      eventType: { $in: ["LOGIN_FAILED", "ADMIN_LOGIN_FAILED"] },
      $or: [
        { userId },
        ...(userEmail ? [{ "metadata.email": userEmail }] : []),
      ],
    };
    const [totalEvents, totalLogins, failedAttempts, lastSuccessfulLoginEvent] = await Promise.all([
      Event.countDocuments({ userId }),
      Event.countDocuments({ userId, eventType: { $in: ["LOGIN_SUCCESS", "ADMIN_LOGIN_SUCCESS"] } }),
      Event.countDocuments(failedFilter),
      Event.findOne({ userId, eventType: { $in: ["LOGIN_SUCCESS", "ADMIN_LOGIN_SUCCESS"] } })
        .sort({ createdAt: -1 })
        .select("createdAt"),
    ]);

    res.json({
      totalEvents,
      loginFailures: failedAttempts,
      totalLogins,
      failedAttempts,
      lastLogin: lastSuccessfulLoginEvent?.createdAt || null,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching user stats" });
  }
};

export const getRecentActivity = async (req, res) => {
  try {
    const userId = req.user._id || req.user.userId;
    const userEmail = req.user.email;
    const events = await Event.find({
      $or: [
        { userId },
        ...(userEmail ? [{ eventType: { $in: ["LOGIN_FAILED", "ADMIN_LOGIN_FAILED"] }, "metadata.email": userEmail }] : []),
      ],
    })
      .sort({ createdAt: -1 })
      .limit(10);
    res.json(events);
  } catch (error) {
    res.status(500).json({ message: "Error fetching recent activity" });
  }
};

export const getGeoHeatmap = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = {
      $or: [
        { "geoLocation.country": { $exists: true, $ne: null } },
        { country: { $exists: true, $ne: null } }, // Backward compatibility for legacy records
      ],
    };

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(`${startDate}T00:00:00.000Z`);
      if (endDate) query.createdAt.$lte = new Date(`${endDate}T23:59:59.999Z`);
    }

    let grouped = await Event.aggregate([
      { $match: query },
      {
        $addFields: {
          resolvedCountry: { $ifNull: ["$geoLocation.country", "$country"] },
        },
      },
      {
        $group: {
          _id: "$resolvedCountry",
          count: { $sum: 1 },
          failedLogins: {
            $sum: {
              $cond: [{ $in: ["$eventType", ["LOGIN_FAILED", "ADMIN_LOGIN_FAILED"]] }, 1, 0],
            },
          },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 30 },
    ]);

    // Fallback for older records that don't have geo fields persisted:
    // derive country from IP at read-time and group in-memory.
    if (!grouped.length) {
      const docs = await Event.find(query)
        .select("eventType ipAddress geoLocation country")
        .sort({ createdAt: -1 })
        .limit(1000)
        .lean();

      const ipCountryCache = new Map();
      const bucket = new Map();

      for (const doc of docs) {
        let country = doc?.geoLocation?.country || doc?.country || null;

        if (!country && doc?.ipAddress) {
          if (ipCountryCache.has(doc.ipAddress)) {
            country = ipCountryCache.get(doc.ipAddress);
          } else {
            const resolved = await getGeoLocation(doc.ipAddress);
            country = resolved?.country || "UNKNOWN";
            ipCountryCache.set(doc.ipAddress, country);
          }
        }

        if (!country) continue;

        const current = bucket.get(country) || { _id: country, count: 0, failedLogins: 0 };
        current.count += 1;
        if (["LOGIN_FAILED", "ADMIN_LOGIN_FAILED"].includes(doc.eventType)) {
          current.failedLogins += 1;
        }
        bucket.set(country, current);
      }

      grouped = Array.from(bucket.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 30);
    }

    const maxCount = grouped.length ? Math.max(...grouped.map((item) => item.count)) : 1;

    return res.json({
      maxCount,
      locations: grouped.map((item) => ({
        country: item._id,
        count: item.count,
        failedLogins: item.failedLogins,
        intensity: Number((item.count / maxCount).toFixed(4)),
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: "Error fetching geo heatmap" });
  }
};

export const getWorldMapStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = {
      $or: [
        { "geoLocation.country": { $exists: true, $ne: null } },
        { country: { $exists: true, $ne: null } },
      ],
    };

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(`${startDate}T00:00:00.000Z`);
      if (endDate) query.createdAt.$lte = new Date(`${endDate}T23:59:59.999Z`);
    }

    const grouped = await Event.aggregate([
      { $match: query },
      {
        $addFields: {
          resolvedCountry: { $ifNull: ["$geoLocation.country", "$country"] },
        },
      },
      {
        $group: {
          _id: "$resolvedCountry",
          events: { $sum: 1 },
          failedLogins: {
            $sum: {
              $cond: [{ $in: ["$eventType", ["LOGIN_FAILED", "ADMIN_LOGIN_FAILED"]] }, 1, 0],
            },
          },
          uniqueUsers: {
            $addToSet: {
              $ifNull: ["$userId", "$metadata.email"],
            },
          },
        },
      },
      { $sort: { events: -1 } },
    ]);

    const countries = grouped
      .map((item) => {
        const name = String(item?._id || "").trim();
        if (!name) return null;
        return {
          country: name,
          events: Number(item?.events || 0),
          failedLogins: Number(item?.failedLogins || 0),
          uniqueUsers: Array.isArray(item?.uniqueUsers)
            ? item.uniqueUsers.filter(Boolean).length
            : 0,
        };
      })
      .filter(Boolean);

    const localEvents = countries
      .filter((row) => String(row.country || "").toUpperCase() === "LOCAL")
      .reduce((sum, row) => sum + Number(row.events || 0), 0);

    const nonLocal = countries.filter((row) => String(row.country || "").toUpperCase() !== "LOCAL");

    return res.json({
      summary: {
        totalEvents: countries.reduce((sum, row) => sum + Number(row.events || 0), 0),
        countriesWithActivity: nonLocal.length,
        localEvents,
      },
      countries: nonLocal,
    });
  } catch (_error) {
    return res.status(500).json({ message: "Error fetching world map stats" });
  }
};

export const getUsageMetrics = async (_req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [totalCalls, byMethod, rollup] = await Promise.all([
      ApiLog.countDocuments({ createdAt: { $gte: since } }),
      ApiLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: "$method", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      ApiLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            errors: { $sum: { $cond: [{ $gte: ["$responseStatus", 400] }, 1, 0] } },
            avgResponseTimeMs: { $avg: "$responseTimeMs" },
          },
        },
      ]),
    ]);

    const summary = rollup[0] || { total: 0, errors: 0, avgResponseTimeMs: 0 };

    return res.json({
      last24Hours: {
        totalCalls,
        avgResponseTimeMs: Number((summary.avgResponseTimeMs || 0).toFixed(2)),
        errorRatePercent: summary.total
          ? Number(((summary.errors / summary.total) * 100).toFixed(2))
          : 0,
        byMethod: byMethod.map((item) => ({ method: item._id, count: item.count })),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Error fetching usage metrics" });
  }
};

const classifyRisk = (score) => {
  if (score >= 80) return "LOW";
  if (score >= 60) return "MEDIUM";
  if (score >= 40) return "HIGH";
  return "CRITICAL";
};

const getDeviceLabel = (userAgent = "") => {
  const ua = String(userAgent || "").toLowerCase();
  if (!ua) return "Unknown";
  if (ua.includes("edg")) return "Edge";
  if (ua.includes("chrome")) return "Chrome";
  if (ua.includes("firefox")) return "Firefox";
  if (ua.includes("safari") && !ua.includes("chrome")) return "Safari";
  if (ua.includes("android")) return "Android";
  if (ua.includes("iphone") || ua.includes("ipad")) return "iOS";
  return "Browser";
};

export const getUserSecurityInsights = async (req, res) => {
  try {
    const userId = req.user._id || req.user.userId;
    const user = await User.findById(userId).select("_id email createdAt").lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const failedAttemptFilter = {
      eventType: { $in: ["LOGIN_FAILED", "ADMIN_LOGIN_FAILED"] },
      createdAt: { $gte: since24h },
      $or: [
        { userId },
        ...(user.email ? [{ "metadata.email": user.email }] : []),
      ],
    };

    const summaryMatchOr = [
      { userId },
      ...(user.email
        ? [
            {
              eventType: { $in: ["LOGIN_FAILED", "ADMIN_LOGIN_FAILED"] },
              "metadata.email": user.email,
            },
          ]
        : []),
    ];

    const [failedLogins24h, recentLogins, activeAlertCount, summaryEvents, newDeviceAlerts, alertsTriggered7d] = await Promise.all([
      Event.countDocuments(failedAttemptFilter),
      Event.find({
        userId,
        eventType: { $in: ["LOGIN_SUCCESS", "ADMIN_LOGIN_SUCCESS"] },
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .select("createdAt geoLocation metadata ipAddress")
        .lean(),
      Alert.countDocuments({
        status: "ACTIVE",
        ...(user.email ? { email: user.email } : {}),
      }),
      Event.aggregate([
        { $match: { $or: summaryMatchOr, createdAt: { $gte: since7d } } },
        {
          $group: {
            _id: null,
            successfulLogins: {
              $sum: {
                $cond: [{ $in: ["$eventType", ["LOGIN_SUCCESS", "ADMIN_LOGIN_SUCCESS"]] }, 1, 0],
              },
            },
            failedAttempts: {
              $sum: {
                $cond: [{ $in: ["$eventType", ["LOGIN_FAILED", "ADMIN_LOGIN_FAILED"]] }, 1, 0],
              },
            },
          },
        },
      ]),
      Alert.countDocuments({
        type: "NEW_DEVICE_LOGIN",
        ...(user.email ? { email: user.email } : {}),
        createdAt: { $gte: since7d },
      }),
      Alert.countDocuments({
        ...(user.email ? { email: user.email } : {}),
        createdAt: { $gte: since7d },
      }),
    ]);

    const allEventIps24h = await Event.distinct("ipAddress", {
      userId,
      createdAt: { $gte: since24h },
    });
    const multipleIpUsage = allEventIps24h.length;

    const locationTimeline = recentLogins.map((event, index) => {
      const currentCountry = event?.geoLocation?.country || "UNKNOWN";
      const previousCountry = index < recentLogins.length - 1 ? (recentLogins[index + 1]?.geoLocation?.country || "UNKNOWN") : currentCountry;
      return {
        timestamp: event.createdAt,
        country: currentCountry,
        city: event?.geoLocation?.city || "",
        device: getDeviceLabel(event?.metadata?.browser),
        ipAddress: event?.ipAddress || "",
        suspicious: index < recentLogins.length - 1 && previousCountry !== currentCountry,
      };
    });

    const countries = recentLogins
      .map((event) => event?.geoLocation?.country)
      .filter(Boolean);
    const distinctCountries = new Set(countries);
    const newCountryLogin = distinctCountries.size > 1;

    const accountAgeDays = Math.max(
      0,
      Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (24 * 60 * 60 * 1000))
    );

    let score = 100;
    score -= failedLogins24h * 5;
    score -= newCountryLogin ? 15 : 0;
    score -= activeAlertCount * 10;
    if (multipleIpUsage > 1) score -= 5;
    if (multipleIpUsage >= 4) score -= 10;
    if (accountAgeDays < 7) score -= 10;
    score = Math.max(0, Math.min(100, score));

    const rollup = summaryEvents[0] || { successfulLogins: 0, failedAttempts: 0 };

    return res.json({
      riskScore: {
        score,
        level: classifyRisk(score),
        factors: {
          failedLogins24h,
          newCountryLogin,
          multipleIpUsage,
          accountAgeDays,
          unresolvedAlerts: activeAlertCount,
        },
      },
      loginLocationTimeline: locationTimeline,
      activitySummary7d: {
        successfulLogins: rollup.successfulLogins || 0,
        failedAttempts: rollup.failedAttempts || 0,
        alertsTriggered: alertsTriggered7d || 0,
        newDevices: newDeviceAlerts || 0,
      },
    });
  } catch (_error) {
    return res.status(500).json({ message: "Error fetching security insights" });
  }
};
