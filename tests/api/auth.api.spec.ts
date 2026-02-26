import { expect, test } from "@playwright/test";
import { testData, urls } from "../fixtures/test-data";

test.describe("Auth API", () => {
  test("admin login success", async ({ request }) => {
    // Ensure account exists (idempotent for already existing account).
    await request.post(`${urls.apiBase}/api/auth/admin/register`, {
      data: {
        name: testData.admin.name,
        email: testData.admin.email,
        password: testData.admin.password,
      },
    });

    const response = await request.post(`${urls.apiBase}/api/auth/admin/login`, {
      data: {
        email: testData.admin.email,
        password: testData.admin.password,
      },
    });

    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      token: expect.any(String),
      user: {
        _id: expect.any(String),
        email: testData.admin.email,
        role: "admin",
      },
    });
  });

  test("admin login failure with wrong password", async ({ request }) => {
    const response = await request.post(`${urls.apiBase}/api/auth/admin/login`, {
      data: {
        email: testData.admin.email,
        password: "wrong-password",
      },
    });
    expect([401, 429]).toContain(response.status());
  });
});
