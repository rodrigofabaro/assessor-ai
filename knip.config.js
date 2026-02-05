/** @type {import('knip').KnipConfig} */
module.exports = {
  entry: [
    "app/**/page.{ts,tsx}",
    "app/**/layout.{ts,tsx}",
    "app/**/route.{ts,tsx}",

    // ✅ these are real entrypoints Knip won’t infer
    "lib/extraction.ts",
    "lib/extraction/index.ts",
    "lib/**/route.{ts,tsx}",
    "scripts/**/*.{js,mjs,ts}",

    "components/**/*.{ts,tsx}",
  ],
  project: ["tsconfig.json"],
  ignore: [
    ".next/**",
    "node_modules/**",
    "prisma/**",
    "scripts/**",
    "reference_uploads/**",
    "uploads/**",
    "prisma.config.ts",
  ],
  // Keep ONLY the ones that are genuinely “config-driven” and often misdetected.
  ignoreDependencies: [
    "tailwindcss",
    "autoprefixer",
  ],
};
