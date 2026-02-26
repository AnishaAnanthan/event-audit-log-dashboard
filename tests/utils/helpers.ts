import { APIRequestContext, expect, Page } from "@playwright/test";
import { testData, urls } from "../fixtures/test-data";

type LoginResponse = {
  token: string;
  user: { _id: string; email: string; role: string; name: string };
};

let cachedAdminLogin: LoginResponse | null = null;
let cachedUserLogin: LoginResponse | null = null;

export async function ensureAdminAccount(request: APIRequestContext) {
  await request.post(`${urls.apiBase}/api/auth/admin/register`, {
    data: {
      name: testData.admin.name,
      email: testData.admin.email,
      password: testData.admin.password,
    },
  });
}

export async function ensureUserAccount(request: APIRequestContext) {
  await request.post(`${urls.apiBase}/api/auth/register`, {
    data: {
      name: testData.user.name,
      email: testData.user.email,
      password: testData.user.password,
    },
  });
}

export async function loginAdminApi(request: APIRequestContext): Promise<LoginResponse> {
  if (cachedAdminLogin) return cachedAdminLogin;

  await ensureAdminAccount(request);
  const response = await request.post(`${urls.apiBase}/api/auth/admin/login`, {
    data: {
      email: testData.admin.email,
      password: testData.admin.password,
    },
  });
  expect(response.ok(), `Admin login failed with status ${response.status()}`).toBeTruthy();
  cachedAdminLogin = (await response.json()) as LoginResponse;
  return cachedAdminLogin;
}

export async function loginUserApi(request: APIRequestContext): Promise<LoginResponse> {
  if (cachedUserLogin) return cachedUserLogin;

  await ensureUserAccount(request);
  const response = await request.post(`${urls.apiBase}/api/auth/login`, {
    data: {
      email: testData.user.email,
      password: testData.user.password,
    },
  });
  expect(response.ok(), `User login failed with status ${response.status()}`).toBeTruthy();
  cachedUserLogin = (await response.json()) as LoginResponse;
  return cachedUserLogin;
}

export async function loginAdminUi(page: Page, request: APIRequestContext) {
  await ensureAdminAccount(request);
  await page.goto(`${urls.adminBase}/login`);
  await page.getByLabel("Email").fill(testData.admin.email);
  await page.getByLabel("Password").fill(testData.admin.password);
  await Promise.all([
    page.waitForResponse((res) => res.url().includes("/api/auth/admin/login") && res.status() === 200),
    page.locator('form button[type="submit"]').click(),
  ]);
  await expect(page).toHaveURL(/\/$/);
}

export async function loginUserUi(page: Page, request: APIRequestContext) {
  await ensureUserAccount(request);
  await page.goto(`${urls.userBase}/`);
  await page.getByPlaceholder("Enter email").fill(testData.user.email);
  await page.locator('input[type="password"]').fill(testData.user.password);
  await Promise.all([
    page.waitForResponse((res) => res.url().includes("/api/auth/login") && res.status() === 200),
    page.getByRole("button", { name: "Login" }).click(),
  ]);
  await expect(page).toHaveURL(/\/dashboard/);
}
