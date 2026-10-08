import { expect, test, type Page } from "@playwright/test";

const menu = (page: Page) => page.getByRole("navigation", { name: "Main menu" });
const messages = (page: Page) => page.getByRole("list", { name: "Messages" }).getByRole("listitem");
const add = async (page: Page, text: string) => {
  await page.getByLabel("New message").fill(text);
  await page.getByRole("button", { name: "Add" }).click();
};

test("Given a visitor on the home page, When they open the messages from the menu, Then the page of the messages has the same menu", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Home");

  await menu(page).getByRole("link", { name: "Messages" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Messages");
  await expect(menu(page).getByRole("link", { name: "Home" })).toBeVisible();
});

test("Given a visitor on the page of the messages, When they add, edit and remove messages, Then the list shows each change, also after a reload", async ({ page }) => {
  await page.goto("/messages");
  await expect(page.getByText("No message yet.")).toBeVisible();

  await add(page, "Hello");
  await expect(messages(page)).toHaveText([/Hello/]);
  await expect(page.getByLabel("New message")).toHaveValue("");
  await add(page, "Bye");
  await expect(messages(page)).toHaveText([/Hello/, /Bye/]);

  await messages(page).filter({ hasText: "Hello" }).getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Text of the message").fill("Hello again");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(messages(page)).toHaveText([/Hello again/, /Bye/]);

  await messages(page).filter({ hasText: "Bye" }).getByRole("button", { name: "Remove" }).click();
  await expect(messages(page)).toHaveText([/Hello again/]);

  await page.reload();
  await expect(messages(page)).toHaveText([/Hello again/]);
});

test("Given a visitor on the page of the messages, When they add a message of spaces only, Then the page tells them why the domain refuses it", async ({ page }) => {
  await page.goto("/messages");

  await add(page, "   ");

  await expect(page.getByRole("alert")).toHaveText("A message cannot be empty.");
  await expect(page.getByLabel("New message")).toHaveValue("   ");
});
