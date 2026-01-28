import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,

  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // ✅ Allow "any" in API routes (fast-moving backend glue)
  {
    files: ["app/api/**/*.ts", "app/api/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // ✅ Allow "any" in declaration files (d.ts)
  {
    files: ["src/types/**/*.d.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },


  // ✅ Temporarily allow "any" in admin + early UI pages while we stabilize Phase 3
  {
    files: ["app/admin/**/*.ts", "app/admin/**/*.tsx", "app/submissions/**/*.ts", "app/submissions/**/*.tsx", "app/upload/**/*.ts", "app/upload/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // ✅ UI helper libs/components and student pages (still moving fast)
  {
    files: [
      "lib/**/*.ts",
      "lib/**/*.tsx",
      "components/**/*.ts",
      "components/**/*.tsx",
      "app/students/**/*.ts",
      "app/students/**/*.tsx",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // ✅ Allow unescaped entities in a few long-form UI pages (copy blocks, quotes)
  {
    files: ["app/submissions/**/*.tsx", "app/submissions/**/*.ts"],
    rules: {
      "react/no-unescaped-entities": "off",
    },
  },



]);
