import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",

      /* ── Design System v1.1 Guardrails ────────────────────────────────
         Block raw hex colors and Tailwind palette colors in className/style.
         Tokens-only policy: use semantic tokens from index.css / tailwind.config.ts.
         Warn-level so existing code compiles; new/refactored code must comply.
      ──────────────────────────────────────────────────────────────────── */
      "no-restricted-syntax": [
        "warn",
        {
          selector: "Literal[value=/#[0-9a-fA-F]{3,8}\\b/]",
          message:
            "Design System v1.1: raw hex colors are forbidden. Use semantic tokens (hsl(var(--...))) from index.css.",
        },
        {
          selector:
            "Literal[value=/\\b(bg|text|border|ring|from|to|via|fill|stroke|shadow|placeholder|divide|outline|decoration|caret|accent)-(slate|gray|zinc|neutral|stone|red|amber|yellow|lime|emerald|teal|sky|blue|indigo|violet|fuchsia|rose)-\\d{2,3}\\b/]",
          message:
            "Design System v1.1: Tailwind palette colors are forbidden. Use semantic tokens (primary, secondary, muted, accent, destructive, success, warning, cyan, pink, gold).",
        },
      ],
    },
  },
);
