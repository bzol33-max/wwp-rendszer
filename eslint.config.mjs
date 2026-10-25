import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // react-hooks/set-state-in-effect: figyelmeztetés, nem hiba (audit Q2,
  // 2026-10-25). 19 meglévő hely (15 fájl) a bevett „betöltés useEffect-ben,
  // előtte setLoading(true)” / „dialógus-reset megnyitáskor” mintát használja;
  // ma helyesen működnek, a szabály szerinti átírásuk viszont (kulcs-alapú
  // reset, eseménykezelőbe költözés) a betöltés/villanás viselkedését
  // változtatná — azt csak komponensenként, kipróbálva érdemes. Új kódban
  // kerüld: a figyelmeztetés látszik az `npm run lint` kimenetében.
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
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
