// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import prettierPlugin from "eslint-plugin-prettier";
import unicornPlugin from "eslint-plugin-unicorn";
import unusedImportsPlugin from "eslint-plugin-unused-imports";
import prettierConfig from "eslint-config-prettier";

export default [
  {
    ignores: [
      "dist/**",
      "demo/**",
      "api-docs/**",
      "node_modules/**",
      "*.js",
      "*.cjs",
      "*.mjs",
    ],
  },
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      import: importPlugin,
      prettier: prettierPlugin,
      unicorn: unicornPlugin,
      "unused-imports": unusedImportsPlugin,
    },
    settings: {
      "import/resolver": {
        typescript: {
          project: "./tsconfig.json",
        },
      },
    },
    rules: {
      // ── ESLint core ──
      ...prettierConfig.rules,
      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: "error",
      curly: ["error", "all"],

      // ── Prettier ──
      "prettier/prettier": "error",

      // ── TypeScript ──
      ...tsPlugin.configs["recommended-type-checked"]?.rules,
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/array-type": ["error", { default: "generic" }],
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        { allowExpressions: true },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/promise-function-async": "error",
      "@typescript-eslint/prefer-readonly": "error",
      "@typescript-eslint/prefer-for-of": "error",
      "@typescript-eslint/only-throw-error": "error",
      "@typescript-eslint/no-shadow": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "typeLike",
          format: ["PascalCase"],
        },
        {
          selector: "variable",
          format: ["camelCase", "UPPER_CASE", "PascalCase"],
          leadingUnderscore: "allow",
          filter: { regex: "^(__dirname|[A-Z][a-zA-Z0-9_]*)$", match: false },
        },
        {
          // Allow math-convention names: A, L, X, Sigma, Kstar, __dirname
          selector: "variable",
          format: null,
          filter: { regex: "^(__dirname|[A-Z][a-zA-Z0-9_]*)$", match: true },
        },
        {
          selector: "parameter",
          format: ["camelCase", "PascalCase"],
          leadingUnderscore: "allow",
        },
        {
          selector: "function",
          format: ["camelCase", "PascalCase"],
          leadingUnderscore: "allow",
        },
      ],
      // Allow underscore-prefixed unused vars (intentionally unused)
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // Keep these OFF for now
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",

      // ── Import ──
      "import/order": [
        "error",
        {
          groups: ["type", "builtin", "external", "internal", "parent", "sibling", "index"],
          alphabetize: { order: "asc", caseInsensitive: true },
          "newlines-between": "always",
        },
      ],

      // ── Unused imports ──
      "unused-imports/no-unused-imports": "error",

      // ── Unicorn ──
      ...unicornPlugin.configs.recommended.rules,
      // Relax some unicorn rules that conflict with math-heavy code
      "unicorn/prevent-abbreviations": "off",
      "unicorn/no-array-reduce": "off",
      "unicorn/no-array-for-each": "off",
      "unicorn/prefer-math-trunc": "off",
      "unicorn/number-literal-case": "off",
      "unicorn/prefer-spread": "off",
      "unicorn/no-for-loop": "off",
      "unicorn/prefer-module": "off",
      "unicorn/no-null": "off",
      "unicorn/prefer-ternary": "off",
      "unicorn/no-nested-ternary": "off",
      "unicorn/filename-case": "off",
      "unicorn/no-new-array": "off",
      "unicorn/consistent-function-scoping": "off",
      "unicorn/prefer-single-call": "off",
      "unicorn/import-style": "off",
      "unicorn/no-array-callback-reference": "off",
      "unicorn/no-array-sort": "off",
      "unicorn/no-array-reverse": "off",
      "unicorn/prefer-query-selector": "off",
      "unicorn/prefer-number-properties": "off",
      "unicorn/no-useless-switch-case": "off",
    },
  },
];
