import js from "@eslint/js";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: ["dist/**", "extension/dist/**", "node_modules/**", "exports/**"]
  },
  js.configs.recommended,
  {
    files: ["extension/src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        project: "./tsconfig.json"
      },
      globals: {
        ...globals.browser,
        ...globals.webextensions
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
    }
  },
  {
    files: ["scripts/**/*.mjs", "extension/tests/**/*.mjs"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  }
];
