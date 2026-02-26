import { expect, test } from "@playwright/test";
import { testData, urls } from "../fixtures/test-data";
import { ensureAdminAccount, ensureUserAccount } from "../utils/helpers";

test.describe("Authentication Flows", () => {
  test("admin login success and failure cases", async ({ page, request }) => {
    await ensureAdminAccount(request);
    await page.goto(`${urls.adminBase}/login`);

    // Failure case first.
    await page.getByLabel("Email").fill(testData.admin.email);
    await page.getByLabel("Password").fill("wrong-password");
    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/auth/admin/login") && [401, 429].includes(res.status())),
      page.locator('form button[type="submit"]').click(),
    ]);
    await expect(page).toHaveURL(/\/login$/);

    // Success case.
    await page.getByLabel("Password").fill(testData.admin.password);
    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/auth/admin/login") && res.status() === 200),
      page.locator('form button[type="submit"]').click(),
    ]);
    await expect(page).toHaveURL(/\/$/);
  });

  test("user login success and failure cases", async ({ page, request }) => {
    await ensureUserAccount(request);
    await page.goto(`${urls.userBase}/`);

    // Failure case.
    await page.getByPlaceholder("Enter email").fill(testData.user.email);
    await page.locator('input[type="password"]').fill("wrong-password");
    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/auth/login") && [401, 429].includes(res.status())),
      page.getByRole("button", { name: "Login" }).click(),
    ]);
    await expect(page).toHaveURL(/\/$/);

    // Success case.
    await page.locator('input[type="password"]').fill(testData.user.password);
    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/auth/login") && res.status() === 200),
      page.getByRole("button", { name: "Login" }).click(),
    ]);
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
