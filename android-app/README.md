# WWP Sofőr — Android app (Capacitor héj)

A sofőr app (`/erkezes`, sofőr szerepkör) Androidos héja. A tartalmat az éles
webről tölti (`capacitor.config.json` → `server.url`), tehát a webes változások
**nem igényelnek új APK-t**. A héj egyetlen dolgot ad hozzá: a **Google ML Kit
dokumentum-szkennert** (`@capacitor-mlkit/document-scanner`) a papír
fotózásához — élő lapkeresés, automatikus fotó, kivágás, fehérítés, több oldal.
A web (`components/erkezes/sofor-app/nativ-szkenner.ts`) ismeri fel, hogy a
héjban fut (`Capacitor.isNativePlatform()` + `WWPSofor/1` user agent).

## Build

Kell: JDK 21, Android SDK (platform 36, build-tools 36), Node.

```bash
cd android-app
npm ci
npx cap sync android
# android/local.properties:  sdk.dir=/útvonal/android-sdk
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
cp app/build/outputs/apk/release/app-release.apk ../../public/letoltes/wwp-sofor.apk
```

## Aláírás — a kulcs SOHA nem kerül a repóba (publikus!)

- `android/keystore.properties` (git-ignorált):
  ```
  storeFile=/abszolút/útvonal/wwp-sofor.jks
  storePassword=...
  keyAlias=wwp-sofor
  keyPassword=...
  ```
- A `wwp-sofor.jks` és a jelszó a tulajdonosnál van (jelszókezelő + pendrive).
  **Ha elveszik, a telefonokon az appot törölni és újratelepíteni kell** (más
  kulccsal aláírt frissítést az Android nem fogad el).

## Új verzió

Csak ha a héj változik (plugin, jogosultság, ikon, URL): `android/app/build.gradle`
→ `versionCode` +1, `versionName`; build; az APK a `public/letoltes/`-be; push.
A sofőr a böngészős sávból / a linkről újratelepíti (a régi fölé, adatvesztés nélkül).

## Telepítés a sofőr telefonjára

1. Chrome-ban: bejelentkezés → a Ma oldalon „Töltsd le a WWP Sofőr appot”.
2. Megnyitás → „Ismeretlen forrás” engedélyezése a Chrome-nak → Telepítés
   (a Play Protect egyszer rákérdez: „Telepítés mégis”).
3. Az appban egyszer be kell jelentkezni. Az első indításkor a szkenner-modult
   a Google Play-szolgáltatás letölti (pár MB, Wi-Fin ajánlott).
