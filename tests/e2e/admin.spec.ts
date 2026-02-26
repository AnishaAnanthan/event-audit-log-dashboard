import { expect, test } from "@playwright/test";
import { urls } from "../fixtures/test-data";
import { loginAdminApi, loginAdminUi, loginUserApi } from "../utils/helpers";

test.describe("Admin Area", () => {
  test("admin navigation + logout flow", async ({ page, request }) => {
    await loginAdminUi(page, request);

    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await page.getByRole("link", { name: "Audit Logs" }).click();
    await expect(page).toHaveURL(/\/logs$/);
    await page.getByRole("link", { name: "Alerts" }).click();
    await expect(page).toHaveURL(/\/alerts$/);

    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("role-based access control blocks normal user from admin APIs", async ({ request }) => {
    const userLogin = await loginUserApi(request);
    const response = await request.get(`${urls.apiBase}/api/events/admin/stats`, {
      headers: { Authorization: `Bearer ${userLogin.token}` },
    });
    expect(response.status()).toBe(403);
  });

  test("admin can access admin-protected APIs", async ({ request }) => {
    const adminLogin = await loginAdminApi(request);
    const response = await request.get(`${urls.apiBase}/api/events/admin/stats`, {
      headers: { Authorization: `Bearer ${adminLogin.token}` },
    });
    expect(response.ok()).toBeTruthy();
  });
});
