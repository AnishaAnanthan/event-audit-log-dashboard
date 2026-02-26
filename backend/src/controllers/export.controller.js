import Event from "../models/event.model.js";
import Alert from "../models/alert.model.js";

const toIso = (value) => (value ? new Date(value).toISOString() : "");

const escapeCsv = (value) => {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

const writeCsvRow = (res, values) => {
  res.write(`${values.map(escapeCsv).join(",")}\n`);
};

const parseDateOrNull = (value, endOfDay = false) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setUTCHours(23, 59, 59, 999);
  return date;
};

export const exportEventsCsv = async (req, res) => {
  try {
    const { eventType, ipAddress, startDate, endDate } = req.query;
    const query = {};

    if (eventType) query.eventType = { $regex: eventType, $options: 'i' };
    if (ipAddress) query.ipAddress = ipAddress;

    const parsedStart = parseDateOrNull(startDate);
    const parsedEnd = parseDateOrNull(endDate, true);
    if ((startDate && !parsedStart) || (endDate && !parsedEnd)) {
      return res.status(400).json({ message: "Invalid date filters" });
    }

    if (parsedStart) query.createdAt = { ...query.createdAt, $gte: parsedStart };
    if (parsedEnd) query.createdAt = { ...query.createdAt, $lte: parsedEnd };

    res.header('Content-Type', 'text/csv; charset=utf-8');
    const filename = `events_export_${new Date().toISOString().replace(/:/g, '-')}.csv`;
    res.attachment(filename);

    writeCsvRow(res, ["Event Type", "Email", "IP Address", "Timestamp", "Status"]);

    const cursor = Event.find(query)
      .sort({ createdAt: -1 })
      .select("eventType ipAddress metadata createdAt")
      .lean()
      .cursor();

    for await (const event of cursor) {
      const status = event.eventType?.includes("FAILED") ? "FAILED" : "SUCCESS";
      writeCsvRow(res, [
        event.eventType || "",
        event.metadata?.email || "",
        event.ipAddress || "",
        toIso(event.createdAt),
        status,
      ]);
    }

    return res.end();

  } catch (error) {
    console.error("Export events error:", error);
    return res.status(500).json({ message: "Error exporting events" });
  }
};

export const exportAlertsCsv = async (req, res) => {
  try {
    const { status, severity, type, search } = req.query;
    const query = {};

    if (status) query.status = status;
    if (severity) query.severity = severity;
    if (type) query.type = type;
    if (search) {
      query.$or = [{ email: { $regex: search, $options: 'i' } }, { ipAddress: { $regex: search, $options: 'i' } }];
    }

    res.header('Content-Type', 'text/csv; charset=utf-8');
    const filename = `alerts_export_${new Date().toISOString().replace(/:/g, '-')}.csv`;
    res.attachment(filename);

    writeCsvRow(res, ["Alert Type", "Severity", "Target", "Count", "Status"]);

    const cursor = Alert.find(query)
      .sort({ createdAt: -1 })
      .select("type severity email ipAddress occurrenceCount status")
      .lean()
      .cursor();

    for await (const alert of cursor) {
      writeCsvRow(res, [
        alert.type || "",
        alert.severity || "",
        alert.email || alert.ipAddress || "",
        alert.occurrenceCount || 0,
        alert.status || "",
      ]);
    }

    return res.end();

  } catch (error) {
    console.error("Export alerts error:", error);
    return res.status(500).json({ message: "Error exporting alerts" });
  }
};
