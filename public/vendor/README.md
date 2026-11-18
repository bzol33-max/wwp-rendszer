# public/vendor

- `opencv-4.10.0.js` — OpenCV.js 4.10.0 (`@techstark/opencv-js@4.10.0-release.1`, Apache-2.0).
  A sofőr app papír-fotózása tölti be (components/erkezes/sofor-app/lap-kereso.ts): lap-keresés és
  perspektíva-kiegyenesítés a telefonon. Saját szerverről szolgáljuk ki (a CSP `script-src 'self'`);
  a beágyazott wasm miatt a CSP-ben `'wasm-unsafe-eval'` kell.

- `maplibre-gl-4.7.1.js`, `maplibre-gl-4.7.1.css` — MapLibre GL JS 4.7.1 (BSD-3-Clause), a cdnjs-ről változtatás nélkül.
  Az Útvonaltervező (public/utvonaltervezo.html) 3D térképe tölti be. Saját szerverről megy ki, hogy az oldalnak
  ne kelljen külső szkript (CSP).
