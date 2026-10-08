import { expect, test } from "@playwright/test";

test("Given a visitor, When they open the home page, Then it shows the name of the app", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("My app");
});
