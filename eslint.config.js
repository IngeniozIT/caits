import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/**", "reports/**", ".stryker-tmp/**", "template/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "no-empty-pattern": ["error", { allowObjectPatternsAsParameters: true }]
    }
  },
  {
    // TypeScript checks the names of the JavaScript files (checkJs), and knows the globals of Node.
    files: ["**/*.js", "**/*.mjs"],
    rules: { "no-undef": "off" }
  },
  {
    // The walk of the architecture check reads the nodes of two trees, of oxc and of Babel, which have no type (see Node in facts.mjs).
    files: ["quality/architecture/facts.mjs"],
    rules: { "@typescript-eslint/no-unsafe-member-access": "off", "@typescript-eslint/no-unsafe-assignment": "off", "@typescript-eslint/no-unsafe-argument": "off", "@typescript-eslint/no-unsafe-call": "off", "@typescript-eslint/no-unsafe-return": "off" }
  },
  {
    // The kernel imports the virtual modules of its Vite plugin: the files that do name the types of these modules with a reference,
    // so that the program of a project, which only reaches the kernel through its imports, sees them too.
    files: ["src/**/*.ts"],
    rules: { "@typescript-eslint/triple-slash-reference": ["error", { path: "always" }] }
  },
  {
    files: ["bin/**/*.test.ts", "src/**/*.test.ts", "src/testing/**/*.ts", "test/**/*.ts"],
    rules: { "@typescript-eslint/unbound-method": "off", "@typescript-eslint/no-unsafe-assignment": "off", "@typescript-eslint/no-unsafe-member-access": "off", "@typescript-eslint/no-unsafe-argument": "off", "@typescript-eslint/no-unsafe-call": "off", "@typescript-eslint/require-await": "off", "@typescript-eslint/no-empty-function": "off" }
  }
);
