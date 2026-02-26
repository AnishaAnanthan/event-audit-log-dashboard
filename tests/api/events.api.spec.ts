import { expect, test } from "@playwright/test";
import { urls } from "../fixtures/test-data";
import { loginAdminApi } from "../utils/helpers";

test.describe("Events API", () => {
  test("get events with valid admin token", async ({ request }) => {
    const adminLogin = await loginAdminApi(request);
    const response = await request.get(`${urls.apiBase}/api/events/admin/all?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${adminLogin.token}` },
    });

    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(Array.isArray(json.events)).toBeTruthy();
    expect(typeof json.totalPages).toBe("number");
    expect(json).toHaveProperty("currentPage");
  });

  test("get events without token is unauthorized", async ({ request }) => {
    const response = await request.get(`${urls.apiBase}/api/events/admin/all?page=1&limit=10`);
    expect(response.status()).toBe(401);
  });

  test("create event API route availability check", async ({ request }) => {
    // Project currently has no public POST /api/events create route.
    const adminLogin = await loginAdminApi(request);
    const response = await request.post(`${urls.apiBase}/api/events`, {
      headers: { Authorization: `Bearer ${adminLogin.token}` },
      data: { eventType: "PLAYWRIGHT_TEST_EVENT" },
    });

    // Keep this test as route contract guard.
    expect([404, 405]).toContain(response.status());
  });
});
