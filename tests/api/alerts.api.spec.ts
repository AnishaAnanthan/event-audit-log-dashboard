import { expect, test } from "@playwright/test";
import { urls } from "../fixtures/test-data";
import { loginAdminApi, loginUserApi } from "../utils/helpers";

test.describe("Alerts API", () => {
  test("get alerts with admin token", async ({ request }) => {
    const adminLogin = await loginAdminApi(request);
    const response = await request.get(`${urls.apiBase}/api/alerts`, {
      headers: { Authorization: `Bearer ${adminLogin.token}` },
    });

    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(Array.isArray(json)).toBeTruthy();
  });

  test("get alerts with user token is forbidden", async ({ request }) => {
    const userLogin = await loginUserApi(request);
    const response = await request.get(`${urls.apiBase}/api/alerts`, {
      headers: { Authorization: `Bearer ${userLogin.token}` },
    });
    expect(response.status()).toBe(403);
  });

  test("invalid alert id resolve returns 400", async ({ request }) => {
    const adminLogin = await loginAdminApi(request);
    const response = await request.put(`${urls.apiBase}/api/alerts/not-an-id/resolve`, {
      headers: { Authorization: `Bearer ${adminLogin.token}` },
      data: {},
    });
    expect(response.status()).toBe(400);
  });
});
