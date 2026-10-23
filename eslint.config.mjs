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
    // A sofőr Android-héja (Capacitor): generált natív projekt, saját csomaggal.
    "android-app/**",
    // Külső, minifikált könyvtár (OpenCV.js).
    "public/vendor/**",
  ]),
]);

export default eslintConfig;
