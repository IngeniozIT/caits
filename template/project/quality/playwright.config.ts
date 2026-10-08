import { defineConfig } from "@playwright/test";
import caits from "./caits/playwright.ts";

/**
 * The Playwright configuration of this project: that of CAITS (quality/caits/playwright.ts), with the changes of this project, which
 * replace its values. To change one value of an object, copy the others: `use: { ...caits.use, locale: "fr-FR" }`.
 */
export default defineConfig({
  ...caits
});
