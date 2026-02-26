import { expect, test } from "@playwright/test";
import { loginUserUi } from "../utils/helpers";

test.describe("User App", () => {
  test("user dashboard loads and supports logout", async ({ page, request }) => {
    await loginUserUi(page, request);

    await expect(page.getByText("Overview")).toBeVisible();
    await expect(page.getByText("Recent Activity")).toBeVisible();
    await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();

    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
