# public/vendor

- `opencv-4.10.0.js` — OpenCV.js 4.10.0 (`@techstark/opencv-js@4.10.0-release.1`, Apache-2.0).
  A sofőr app papír-fotózása tölti be (components/erkezes/sofor-app/lap-kereso.ts): lap-keresés és
  perspektíva-kiegyenesítés a telefonon. Saját szerverről szolgáljuk ki (a CSP `script-src 'self'`);
  a beágyazott wasm miatt a CSP-ben `'wasm-unsafe-eval'` kell.
