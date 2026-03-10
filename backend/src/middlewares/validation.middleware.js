const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isValidISODate = (value) => {
  if (!value) return true;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
};

const isStrongPassword = (value) =>
  typeof value === "string" &&
  value.length >= 8 &&
  /[A-Z]/.test(value) &&
  /[a-z]/.test(value) &&
  /\d/.test(value) &&
  /[^A-Za-z0-9]/.test(value);

export const validateRegisterBody = (req, res, next) => {
  const { name, email, password, confirmPassword } = req.body || {};
  if (!isNonEmptyString(name) || !isNonEmptyString(email) || !isNonEmptyString(password)) {
    return res.status(400).json({ message: "Name, email and password are required" });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "Invalid email format" });
  }
  if (!isNonEmptyString(confirmPassword)) {
    return res.status(400).json({ message: "Confirm password is required" });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ message: "Passwords do not match" });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({
      message: "Password must be at least 8 characters and include upper, lower, number, and special character",
    });
  }
  return next();
};

export const validateLoginBody = (req, res, next) => {
  const { email, password } = req.body || {};
  if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
    return res.status(400).json({ message: "Email and password are required" });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "Invalid email format" });
  }
  return next();
};

export const validatePasswordChangeBody = (req, res, next) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!isNonEmptyString(currentPassword) || !isNonEmptyString(newPassword)) {
    return res.status(400).json({ message: "Current and new passwords are required" });
  }
  return next();
};

export const validateDateRangeQuery = (req, res, next) => {
  const { startDate, endDate } = req.query || {};
  if (!isValidISODate(startDate) || !isValidISODate(endDate)) {
    return res.status(400).json({ message: "Invalid date query format" });
  }
  return next();
};
