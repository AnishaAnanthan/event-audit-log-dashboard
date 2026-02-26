const normalizeLoopback = (value: string) => value.replace("127.0.0.1", "localhost");

export const testData = {
  admin: {
    name: process.env.TEST_ADMIN_NAME || "Playwright Admin",
    email: process.env.TEST_ADMIN_EMAIL || "playwright.admin@example.com",
    password: process.env.TEST_ADMIN_PASSWORD || "Pass123!",
  },
  user: {
    name: process.env.TEST_USER_NAME || "Playwright User",
    email: process.env.TEST_USER_EMAIL || "playwright.user@example.com",
    password: process.env.TEST_USER_PASSWORD || "Pass123!",
  },
  invalidUser: {
    email: "invalid.user@example.com",
    password: "wrong-password",
  },
};

export const urls = {
  adminBase: normalizeLoopback(process.env.FRONTEND_BASE_URL || "http://localhost:5174"),
  userBase: normalizeLoopback(process.env.USER_APP_BASE_URL || "http://localhost:5173"),
  apiBase: normalizeLoopback(process.env.API_BASE_URL || "http://localhost:5000"),
};
