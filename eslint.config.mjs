import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Külső, minifikált könyvtár (OpenCV.js).
    "public/vendor/**",
    // Kivezetett, megőrzött fájlok (archive/README.md).
    "archive/**",
  ]),
]);

export default eslintConfig;
