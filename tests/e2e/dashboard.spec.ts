import { expect, test } from "@playwright/test";
import { loginAdminUi } from "../utils/helpers";

test.describe("Admin Dashboard Rendering", () => {
  test("dashboard page loads with charts and key sections", async ({ page, request }) => {
    await loginAdminUi(page, request);

    await expect(page.getByText("Total Events")).toBeVisible();
    await expect(page.getByText("Event Activity")).toBeVisible();
    await expect(page.getByText("Alert Severity")).toBeVisible();
    await expect(page.getByText("Event Type Distribution")).toBeVisible();

    // Chart.js renders canvas elements for charts.
    await expect(page.locator("canvas").first()).toBeVisible();
  });
});
