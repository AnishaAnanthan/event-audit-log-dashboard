import fs from "fs/promises";
import path from "path";
import ImportedEvent from "../models/importedEvent.model.js";

const SUPPORTED_EXTENSIONS = new Set([".log", ".txt"]);
const DEFAULT_TTL_HOURS = 24;

const getImportTtlHours = () => {
  const parsed = Number(process.env.IMPORTED_LOG_TTL_HOURS || DEFAULT_TTL_HOURS);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TTL_HOURS;
  return parsed;
};

const buildExpiryDate = () => new Date(Date.now() + getImportTtlHours() * 60 * 60 * 1000);

const parseDateSafe = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const normalizeIp = (value) => {
  if (!value) return "0.0.0.0";
  const cleaned = String(value).trim();
  if (!cleaned) return "0.0.0.0";
  if (cleaned === "::1") return "127.0.0.1";
  return cleaned;
};

const extractIpv4 = (line) => {
  const match = String(line || "").match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
  return match?.[0] || null;
};

const extractKeyValuePairs = (text) => {
  const pairs = {};
  const regex = /\b([a-zA-Z_][a-zA-Z0-9_]*)=([^\s;]*)/g;
  const source = String(text || "");
  let match = regex.exec(source);
  while (match) {
    const key = String(match[1] || "").trim();
    if (key && !(key in pairs)) {
      pairs[key] = String(match[2] || "").trim();
    }
    match = regex.exec(source);
  }
  return pairs;
};

const levelFromText = (text) => {
  const line = String(text || "").toLowerCase();
  if (line.includes("critical") || line.includes("fatal") || line.includes("panic")) return "CRITICAL";
  if (line.includes("error") || line.includes("failed") || line.includes("failure")) return "HIGH";
  if (line.includes("warn")) return "MEDIUM";
  return "LOW";
};

const parseApacheErrorDate = (value) => parseDateSafe(value);

const parseApacheAccessDate = (value) => {
  const match = String(value || "").match(/^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})$/);
  if (!match) return null;
  const [, dd, mon, yyyy, hh, mm, ss, zone] = match;
  return parseDateSafe(`${dd} ${mon} ${yyyy} ${hh}:${mm}:${ss} ${zone}`);
};

const parseMonthDayTime = (value, fallbackYear = new Date().getFullYear()) => {
  const parsed = parseDateSafe(`${value} ${fallbackYear}`);
  return parsed;
};

const parseAndroidDate = (value, fallbackYear = new Date().getFullYear()) => {
  const match = String(value || "").match(/^(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3})$/);
  if (!match) return null;
  const [, mm, dd, hh, min, ss, ms] = match;
  return parseDateSafe(`${fallbackYear}-${mm}-${dd}T${hh}:${min}:${ss}.${ms}Z`);
};

const parseBglDate = (value) => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})\.(\d{2})\.(\d{2})\.(\d+)$/);
  if (!match) return null;
  const [, yyyy, mm, dd, hh, min, ss] = match;
  return parseDateSafe(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}Z`);
};

const asEvent = ({
  eventType,
  ipAddress,
  createdAt,
  sourceSystem,
  sourceFile,
  rawLine,
  metadata = {},
  endpoint = "",
  method = "",
  expiresAt,
}) => ({
  eventType,
  ipAddress: normalizeIp(ipAddress),
  endpoint: endpoint || "/imported-log",
  method: method || "IMPORT",
  metadata: {
    ...metadata,
    sourceSystem,
    sourceFile,
    imported: true,
    importTag: "external_log_file",
    rawLine: String(rawLine || "").slice(0, 1200),
  },
  createdBy: "log-import",
  updatedBy: "log-import",
  expiresAt: expiresAt || buildExpiryDate(),
  ...(createdAt ? { createdAt, updatedAt: createdAt } : {}),
});

const parseApacheErrorLogLine = (line, sourceFile) => {
  const match = String(line).match(/^\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.*)$/);
  if (!match) return null;
  const [, dateRaw, levelRaw, message] = match;
  const createdAt = parseApacheErrorDate(dateRaw);
  const level = String(levelRaw || "").toUpperCase();
  const eventType = level === "ERROR" ? "APACHE_ERROR" : "APACHE_EVENT";
  return asEvent({
    eventType,
    ipAddress: extractIpv4(message),
    createdAt,
    sourceSystem: "apache-error",
    sourceFile,
    rawLine: line,
    metadata: { level, message },
  });
};

const parseApacheAccessLogLine = (line, sourceFile) => {
  const match = String(line).match(
    /^(\S+) \S+ \S+ \[([^\]]+)\] "([A-Z]+)\s([^"]*?)\sHTTP\/[0-9.]+" (\d{3}) (\S+)/
  );
  if (!match) return null;
  const [, ip, dateRaw, method, url, statusRaw, bytesRaw] = match;
  const statusCode = Number(statusRaw || 0);
  const createdAt = parseApacheAccessDate(dateRaw);
  return asEvent({
    eventType: statusCode >= 400 ? "HTTP_REQUEST_FAILED" : "HTTP_REQUEST_SUCCESS",
    ipAddress: ip,
    createdAt,
    sourceSystem: "apache-access",
    sourceFile,
    rawLine: line,
    endpoint: url || "/",
    method,
    metadata: {
      statusCode,
      bytes: bytesRaw === "-" ? 0 : Number(bytesRaw || 0),
      level: statusCode >= 500 ? "ERROR" : statusCode >= 400 ? "WARN" : "INFO",
    },
  });
};

const parseLinuxAuthLine = (line, sourceFile) => {
  const match = String(line).match(/^([A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+([^:]+):\s?(.*)$/);
  if (!match) return null;
  const [, dateRaw, host, processName, message] = match;
  const createdAt = parseMonthDayTime(dateRaw);
  const lower = String(message || "").toLowerCase();
  const failed = lower.includes("authentication failure") || lower.includes("failed") || lower.includes("user unknown");
  const kvPairs = extractKeyValuePairs(message);
  const userMatch = String(message).match(/\buser=([^\s]+)/i);
  const authUser = kvPairs.user || userMatch?.[1] || "";
  return asEvent({
    eventType: failed ? "LOGIN_FAILED" : "LOGIN_SUCCESS",
    ipAddress: extractIpv4(message),
    createdAt,
    sourceSystem: "linux-auth",
    sourceFile,
    rawLine: line,
    metadata: {
      host,
      processName,
      message,
      level: failed ? "ERROR" : "INFO",
      email: authUser,
      authUser,
      ...kvPairs,
    },
  });
};

const parseMacLine = (line, sourceFile) => {
  const match = String(line).match(/^([A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+([^:]+):\s?(.*)$/);
  if (!match) return null;
  const [, dateRaw, host, processName, message] = match;
  const createdAt = parseMonthDayTime(dateRaw);
  const level = levelFromText(message);
  return asEvent({
    eventType: level === "HIGH" || level === "CRITICAL" ? "MAC_ERROR" : "MAC_EVENT",
    ipAddress: extractIpv4(message),
    createdAt,
    sourceSystem: "mac",
    sourceFile,
    rawLine: line,
    metadata: { host, processName, message, level },
  });
};

const parseAndroidLine = (line, sourceFile) => {
  const match = String(line).match(/^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+\d+\s+\d+\s+([VDIWEF])\s+([^:]+):\s?(.*)$/);
  if (!match) return null;
  const [, dateRaw, levelChar, tag, message] = match;
  const createdAt = parseAndroidDate(dateRaw);
  const levelMap = { V: "LOW", D: "LOW", I: "MEDIUM", W: "HIGH", E: "HIGH", F: "CRITICAL" };
  const level = levelMap[levelChar] || "LOW";
  return asEvent({
    eventType: level === "HIGH" || level === "CRITICAL" ? "ANDROID_ERROR" : "ANDROID_EVENT",
    ipAddress: extractIpv4(message),
    createdAt,
    sourceSystem: "android",
    sourceFile,
    rawLine: line,
    metadata: { tag, message, level, levelChar },
  });
};

const parseWindowsLine = (line, sourceFile) => {
  const match = String(line).match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\s*([A-Za-z]+)\s+([A-Za-z0-9_]+)\s+(.*)$/);
  if (!match) return null;
  const [, dateRaw, levelRaw, component, message] = match;
  const createdAt = parseDateSafe(dateRaw.replace(" ", "T"));
  const level = String(levelRaw || "").toUpperCase();
  return asEvent({
    eventType: level === "ERROR" ? "WINDOWS_ERROR" : "WINDOWS_EVENT",
    ipAddress: extractIpv4(message),
    createdAt,
    sourceSystem: "windows",
    sourceFile,
    rawLine: line,
    metadata: { level, component, message },
  });
};

const parseBglLine = (line, sourceFile) => {
  const parts = String(line).trim().split(/\s+/);
  if (parts.length < 10) return null;
  const timeToken = parts[4];
  const component = parts[6] || "";
  const subsystem = parts[7] || "";
  const level = parts[8] || "INFO";
  const message = parts.slice(9).join(" ");
  const createdAt = parseBglDate(timeToken);
  const normalizedLevel = String(level).toUpperCase();
  return asEvent({
    eventType: normalizedLevel === "FATAL" || normalizedLevel === "ERROR" ? "BGL_ERROR" : "BGL_EVENT",
    ipAddress: extractIpv4(message),
    createdAt,
    sourceSystem: "bgl",
    sourceFile,
    rawLine: line,
    metadata: { component, subsystem, level: normalizedLevel, message },
  });
};

const parseGenericLine = (line, sourceFile) => {
  const level = levelFromText(line);
  return asEvent({
    eventType: level === "HIGH" || level === "CRITICAL" ? "GENERIC_ERROR" : "GENERIC_EVENT",
    ipAddress: extractIpv4(line),
    createdAt: null,
    sourceSystem: "generic",
    sourceFile,
    rawLine: line,
    metadata: { level, message: line },
  });
};

const parseLineByFilename = (line, filename) => {
  const name = String(filename || "").toLowerCase();
  if (!String(line || "").trim()) return null;

  if (name.includes("apache") && String(line).startsWith("[")) return parseApacheErrorLogLine(line, filename);
  if (name.includes("apache") && /^\S+ \S+ \S+ \[/.test(String(line))) return parseApacheAccessLogLine(line, filename);
  if (name.includes("linux")) return parseLinuxAuthLine(line, filename);
  if (name.includes("mac")) return parseMacLine(line, filename);
  if (name.includes("android")) return parseAndroidLine(line, filename);
  if (name.includes("windows")) return parseWindowsLine(line, filename);
  if (name.includes("bgl")) return parseBglLine(line, filename);

  if (/^\S+ \S+ \S+ \[/.test(String(line))) return parseApacheAccessLogLine(line, filename);
  if (/^\[[^\]]+\]\s+\[[^\]]+\]/.test(String(line))) return parseApacheErrorLogLine(line, filename);
  if (/^\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3}/.test(String(line))) return parseAndroidLine(line, filename);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},/.test(String(line))) return parseWindowsLine(line, filename);
  if (/^-\s+\d+\s+\d{4}\.\d{2}\.\d{2}/.test(String(line))) return parseBglLine(line, filename);
  if (/^[A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2}/.test(String(line))) return parseLinuxAuthLine(line, filename);

  return parseGenericLine(line, filename);
};

const resolveLogFolder = async () => {
  const candidates = [
    path.resolve(process.cwd(), "logFiles"),
    path.resolve(process.cwd(), "../logFiles"),
    path.resolve(process.cwd(), "../../logFiles"),
  ];

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) return candidate;
    } catch (_error) {
      // ignore and continue
    }
  }

  const err = new Error("logFiles folder not found");
  err.statusCode = 404;
  throw err;
};

export const importCollectedLogFiles = async ({ clearExistingImported = false } = {}) => {
  const logFolder = await resolveLogFolder();
  const dirEntries = await fs.readdir(logFolder, { withFileTypes: true });
  const files = dirEntries
    .filter((entry) => entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  if (!files.length) {
    return {
      importSessionId: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      importedCount: 0,
      skippedCount: 0,
      files: [],
      minDate: null,
      maxDate: null,
      folder: logFolder,
    };
  }

  if (clearExistingImported) {
    await ImportedEvent.deleteMany({ "metadata.importTag": "external_log_file" });
  }

  const importSessionId = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const expiresAt = buildExpiryDate();
  const perFile = [];
  let importedCount = 0;
  let skippedCount = 0;
  let minDate = null;
  let maxDate = null;

  for (const filename of files) {
    const filePath = path.join(logFolder, filename);
    const content = await fs.readFile(filePath, "utf8");
    const lines = content.split(/\r?\n/);
    const docs = [];
    let fileSkipped = 0;

    for (const line of lines) {
      const parsed = parseLineByFilename(line, filename);
      if (!parsed) {
        fileSkipped += 1;
        continue;
      }

      if (parsed.createdAt instanceof Date && !Number.isNaN(parsed.createdAt.getTime())) {
        if (!minDate || parsed.createdAt < minDate) minDate = parsed.createdAt;
        if (!maxDate || parsed.createdAt > maxDate) maxDate = parsed.createdAt;
      }

      parsed.metadata = {
        ...(parsed.metadata || {}),
        importSessionId,
      };
      parsed.expiresAt = expiresAt;
      docs.push(parsed);
    }

    if (docs.length) {
      await ImportedEvent.insertMany(docs, { ordered: false });
    }

    importedCount += docs.length;
    skippedCount += fileSkipped;
    perFile.push({
      filename,
      totalLines: lines.length,
      imported: docs.length,
      skipped: fileSkipped,
    });
  }

  return {
    importSessionId,
    folder: logFolder,
    importedCount,
    skippedCount,
    files: perFile,
    minDate: minDate ? minDate.toISOString() : null,
    maxDate: maxDate ? maxDate.toISOString() : null,
  };
};

export const importUploadedLogFile = async ({ fileName, content, replacePreviousUploads = false } = {}) => {
  const safeName = String(fileName || "").trim();
  const text = String(content || "");
  if (!safeName) {
    const err = new Error("fileName is required");
    err.statusCode = 400;
    throw err;
  }
  if (!text.trim()) {
    const err = new Error("content is empty");
    err.statusCode = 400;
    throw err;
  }

  if (replacePreviousUploads) {
    await ImportedEvent.deleteMany({ "metadata.importTag": "uploaded_external_file" });
  }

  const lines = text.split(/\r?\n/);
  const docs = [];
  let skippedCount = 0;
  let minDate = null;
  let maxDate = null;
  const importSessionId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const expiresAt = buildExpiryDate();

  for (const line of lines) {
    const parsed = parseLineByFilename(line, safeName);
    if (!parsed) {
      skippedCount += 1;
      continue;
    }

    if (parsed.createdAt instanceof Date && !Number.isNaN(parsed.createdAt.getTime())) {
      if (!minDate || parsed.createdAt < minDate) minDate = parsed.createdAt;
      if (!maxDate || parsed.createdAt > maxDate) maxDate = parsed.createdAt;
    }

    parsed.metadata = {
      ...(parsed.metadata || {}),
      importTag: "uploaded_external_file",
      importSessionId,
      uploadedFileName: safeName,
    };
    parsed.expiresAt = expiresAt;
    docs.push(parsed);
  }

  if (docs.length) {
    await ImportedEvent.insertMany(docs, { ordered: false });
  }

  return {
    importSessionId,
    fileName: safeName,
    totalLines: lines.length,
    importedCount: docs.length,
    skippedCount,
    minDate: minDate ? minDate.toISOString() : null,
    maxDate: maxDate ? maxDate.toISOString() : null,
  };
};
