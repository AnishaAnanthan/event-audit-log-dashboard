const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const sanitizeString = (value) => {
  if (typeof value !== "string") return value;
  return value
    .replace(/<\s*script/gi, "")
    .replace(/<\/\s*script\s*>/gi, "")
    .replace(/[<>]/g, "");
};

const maliciousPatterns = [
  /\$ne\s*:/i,
  /\$gt\s*:/i,
  /\$gte\s*:/i,
  /\$lt\s*:/i,
  /\$lte\s*:/i,
  /\$where/i,
  /<\s*script/i,
  /onerror\s*=/i,
  /onload\s*=/i,
];

const hasMaliciousString = (value) => {
  if (typeof value === "string") {
    return maliciousPatterns.some((pattern) => pattern.test(value));
  }

  if (Array.isArray(value)) {
    return value.some(hasMaliciousString);
  }

  if (!isPlainObject(value)) {
    return false;
  }

  return Object.entries(value).some(([key, child]) => {
    if (key.startsWith("$") || key.includes(".")) {
      return true;
    }
    return hasMaliciousString(child);
  });
};

const sanitizeValue = (value) => {
  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      value[index] = sanitizeValue(item);
    });
    return value;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  for (const key of Object.keys(value)) {
    const safeKey = key.replace(/\$/g, "").replace(/\./g, "");
    const sanitizedChild = sanitizeValue(value[key]);

    if (safeKey !== key) {
      delete value[key];
      value[safeKey] = sanitizedChild;
    } else {
      value[key] = sanitizedChild;
    }
  }

  return value;
};

const sanitizeInput = (req, _res, next) => {
  if (hasMaliciousString(req.body) || hasMaliciousString(req.params) || hasMaliciousString(req.query)) {
    return next({ statusCode: 400, message: "Invalid or unsafe input detected" });
  }

  if (req.body) sanitizeValue(req.body);
  if (req.params) sanitizeValue(req.params);
  if (req.query) sanitizeValue(req.query);
  return next();
};

export default sanitizeInput;
