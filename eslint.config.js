import js from "@eslint/js";
import globals from "globals";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginReactRefresh from "eslint-plugin-react-refresh";

export default [
  // ── Archivos a ignorar ──────────────────────────────────────────────────
  { ignores: ["dist/", "node_modules/", "src-tauri/", "backend/"] },

  // ── Configuración principal ─────────────────────────────────────────────
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],

    // Reglas base de ESLint (JS)
    ...js.configs.recommended,

    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },

      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },

    plugins: {
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      "react-refresh": pluginReactRefresh,
    },

    settings: {
      react: {
        version: "18.2",
      },
    },

    rules: {
      // ── React ─────────────────────────────────────────────────────────
      "react/jsx-uses-react": "error",
      "react/jsx-uses-vars": "error",
      "react/jsx-no-undef": "error",
      "react/jsx-key": ["warn", { checkFragmentShorthand: true }],
      "react/jsx-no-duplicate-props": "error",
      "react/no-unescaped-entities": "warn",
      "react/no-children-prop": "error",
      "react/self-closing-comp": ["warn", { component: true, html: true }],
      "react/jsx-boolean-value": ["warn", "never"],
      "react/jsx-curly-brace-presence": ["warn", { props: "never", children: "never" }],

      // ── React Hooks ────────────────────────────────────────────────────
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // ── React Refresh (Vite) ───────────────────────────────────────────
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // ── General ────────────────────────────────────────────────────────
      "no-unused-vars": ["warn", {
        vars: "all",
        args: "after-used",
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        ignoreRestSiblings: true,
      }],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      "prefer-const": "warn",
      "no-var": "error",
      "eqeqeq": ["warn", "smart"],
      "curly": ["warn", "multi-line"],
      "no-throw-literal": "error",
      "prefer-template": "warn",
      "no-useless-concat": "warn",
      "default-case-last": "warn",
      "no-alert": "warn",
    },
  },

  // ── Configuración para test files (Vitest globals) ─────────────────────
  //    NOTA: debe ir DESPUÉS del bloque principal para que sus overrides
  //    ganen (en flat config, el último bloque que matchea tiene prioridad).
  {
    files: ["src/**/*.{test,spec}.{js,jsx}"],
    languageOptions: {
      globals: {
        ...globals.vitest,
      },
    },
    rules: {
      "no-unused-vars": "off",
      "react-refresh/only-export-components": "off",
    },
  },
];
