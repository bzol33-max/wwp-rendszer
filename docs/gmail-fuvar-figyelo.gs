/**
 * WWP — Gmail fuvar-figyelő (Google Apps Script)
 * ==============================================
 *
 * MIÉRT ÍGY: a rendszernek látnia kell a beérkező fuvarmegbízásokat, de a
 * Gmail API `gmail.readonly` jogosultsága a Google-nál „restricted scope":
 * egy külső alkalmazásnak hitelesítést (és éves biztonsági auditot) kellene
 * hozzá szereznie, „Testing" módban pedig a refresh token 7 naponta lejár —
 * vagyis hetente újra be kellene jelentkezni. Ez a script viszont a SAJÁT
 * Google-fiókodban fut, a te jogaiddal: nincs külső alkalmazás, nincs
 * lejáró token, és a levelek tartalma nem hagyja el a postafiókot.
 *
 * MIT CSINÁL 5 PERCENKÉNT:
 *   1. Lekérdezi, mely korábbi levelek csatolmányát és szövegét várja a
 *      rendszer. A szöveget CSAK a megbízásnak osztályozott levelekről kéri
 *      (2026-09-25: az EUCARGO a felrakókat és lerakókat a levélben küldte,
 *      a PDF-ben csak annyi állt, hogy „e-mailben küldöm”). Előbb a
 *      szöveget, utána a csatolmányt küldi, hogy a beolvasás a kettőt
 *      együtt kapja.
 *   2. A „Fuvarmegbízás" CÍMKÉVEL ellátott levelekről METAADATOT küld
 *      (feladó, tárgy, snippet, csatolmánynevek). A rendszer ebből osztályoz.
 *
 * CSAK CÍMKÉZETT LEVÉL (Zoltán döntése, 2026-09-20): a figyelő NEM nézi a
 * teljes postafiókot, csak azt, amit te (vagy egy Gmail-szűrő) a
 * „Fuvarmegbízás" címkével megjelölsz. Más címke a CIMKE Script
 * Propertyvel állítható. A `listazCimkeket` függvény kiírja a fiók összes
 * címkéjét, ha a pontos nevet keresed.
 *
 * BEÁLLÍTÁS (egyszer, kb. 5 perc):
 *   1. script.google.com → Új projekt → a tartalom beillesztése ide.
 *   2. Projekt beállításai → Script Properties → két sor (a harmadik nem
 *      kötelező):
 *        ALAP_URL = https://web-production-91051.up.railway.app
 *        TOKEN    = <ugyanaz, mint a Railway GMAIL_FIGYELO_SECRET>
 *        CIMKE    = <a figyelt Gmail-címke, ha nem „Fuvarmegbízás">
 *        MAPPA    = <a Drive „Fuvarmegbizások" mappa azonosítója, ha változik>
 *   3. Futtatás: `egyszeriProba` — a Google engedélyt kér (Gmail olvasás,
 *      Drive-írás és külső kérés), engedélyezd. A Drive-jog azért kell, mert
 *      a megbízás-iratot ez a script tölti fel a figyelt mappába. A napló megmutatja, mit küldött volna.
 *   4. Futtatás: `telepitIdozitot` — ettől 5 percenként magától fut.
 *      (Leállítás: `torolIdozitot`.)
 *
 * ADATVÉDELEM: csak a címkézett leveleket nézi, a KIZART_FELADO listát
 * kihagyja. A levél teljes szövegét és a csatolmányát csak arra a levélre
 * küldi, amit a rendszer KÉRT (tehát megbízásnak osztályozott).
 *
 * FRISSÍTÉS (2026-09-25): a script.google.com projektben cseréld le a teljes
 * tartalmat erre a fájlra, és mentsd. Az időzítőt nem kell újra telepíteni.
 */

/** Ezekről a feladókról semmit nem küldünk (bank, hatóság, magán). */
var KIZART_FELADO = [
  'otpbank.hu', 'erstebank.hu', 'kh.hu', 'raiffeisen.hu', 'unicreditbank.hu', 'mbhbank.hu', 'revolut.com', 'wise.com',
  'nav.gov.hu', 'magyarorszag.hu', 'ugyfelkapu', 'onyf.hu', 'oep.hu',
  'gmail.com/personal-placeholder'
];
/** Ezeket a címkéket kihagyjuk (pl. ha valamit kézzel „Magán"-nak jelölsz). */
var KIZART_CIMKE = ['Magán', 'Privat', 'Private'];

/** Csak az ezzel a címkével megjelölt leveleket dolgozzuk fel. */
var ALAP_CIMKE = 'Fuvarmegbízás';

/**
 * A Drive „Fuvarmegbizások" mappája — IDE tölti fel a script a megbízás-
 * iratot, a TE fiókod nevében és kvótájából. Script Property: MAPPA.
 *
 * MIÉRT A SCRIPT TÖLTI FEL: a mappa a te személyes My Drive-odban van, a
 * szerver viszont service accounttal hitelesít, annak pedig nincs
 * tárhelykvótája — a szerveroldali feltöltés 403 `storageQuotaExceeded`-del
 * elszállt (éles 500-ak 2026-09-20-ig). Olvasni tud, ezért a drive-sync
 * változatlanul importálja, amit ide feltöltünk.
 */
var ALAP_MAPPA = '1JNUvwN30It3_rooGkeTGTpkO4K9bix2n';
/** Ennyi napra visszamenőleg nézzük a címkézett leveleket. */
var VISSZA_NAP = 14;

var MAX_LEVEL_EGY_KORBEN = 60;
var MAX_CSATOLMANY_BYTE = 15 * 1024 * 1024;

function beallitas_(kulcs) {
  var v = PropertiesService.getScriptProperties().getProperty(kulcs);
  if (!v) throw new Error('Hiányzó Script Property: ' + kulcs);
  return v;
}

function hivas_(ut, opciok) {
  var url = beallitas_('ALAP_URL').replace(/\/$/, '') + ut;
  var p = opciok || {};
  p.muteHttpExceptions = true;
  p.headers = p.headers || {};
  p.headers.Authorization = 'Bearer ' + beallitas_('TOKEN');
  var valasz = UrlFetchApp.fetch(url, p);
  var kod = valasz.getResponseCode();
  var szoveg = valasz.getContentText();
  if (kod < 200 || kod >= 300) throw new Error(ut + ' → HTTP ' + kod + ': ' + szoveg.slice(0, 300));
  return szoveg ? JSON.parse(szoveg) : {};
}

function kizart_(uzenet) {
  var felado = (uzenet.getFrom() || '').toLowerCase();
  for (var i = 0; i < KIZART_FELADO.length; i++) {
    if (felado.indexOf(KIZART_FELADO[i]) !== -1) return true;
  }
  var cimkek = uzenet.getThread().getLabels();
  for (var j = 0; j < cimkek.length; j++) {
    if (KIZART_CIMKE.indexOf(cimkek[j].getName()) !== -1) return true;
  }
  return false;
}

function emailCim_(felado) {
  var m = /<([^>]+)>/.exec(felado || '');
  return (m ? m[1] : (felado || '')).trim().toLowerCase();
}
function feladoNev_(felado) {
  var m = /^\s*"?([^"<]*?)"?\s*</.exec(felado || '');
  return m ? m[1].trim() : '';
}

/** A levél szövegének felső határa (a szerver is ennyinél vág). */
var MAX_TORZS_KARAKTER = 50000;

/** 1a. kör: a kért megbízás-levelek teljes szövege. */
function kertTorzsekBekuldese_(kertTorzs) {
  var db = 0;
  for (var i = 0; i < kertTorzs.length; i++) {
    var uzenet;
    try {
      uzenet = GmailApp.getMessageById(kertTorzs[i]);
    } catch (e) {
      continue;
    }
    if (!uzenet || kizart_(uzenet)) continue;
    hivas_('/api/fuvarozas2/gmail/torzs', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ gmailMessageId: kertTorzs[i], torzs: String(uzenet.getPlainBody() || '').slice(0, MAX_TORZS_KARAKTER) }),
    });
    db++;
  }
  return db;
}

/** 1b. kör: a rendszer által kért csatolmányok feltöltése. */
function kertCsatolmanyokFeltoltese_(kert) {
  var db = 0;
  for (var i = 0; i < kert.length; i++) {
    var uzenet;
    try {
      uzenet = GmailApp.getMessageById(kert[i]);
    } catch (e) {
      continue;
    }
    if (!uzenet || kizart_(uzenet)) continue;
    var csatolmanyok = uzenet.getAttachments({ includeInlineImages: false, includeAttachments: true });
    for (var j = 0; j < csatolmanyok.length; j++) {
      var cs = csatolmanyok[j];
      if (cs.getSize() > MAX_CSATOLMANY_BYTE) continue;
      if (!/\.(pdf|docx?|xlsx?|jpe?g|png)$/i.test(cs.getName())) continue;
      // Feltöltés a SAJÁT fiókból a figyelt Drive-mappába, és csak az
      // azonosítót küldjük. Ha ez nem megy (rossz mappa-azonosító, jogosultság),
      // tartalékként a tartalmat küldjük — a szerver próbálja meg.
      var driveFajl = null;
      try {
        driveFajl = DriveApp.getFolderById(mappaId_()).createFile(cs);
      } catch (e) {
        Logger.log('Drive-feltöltés nem sikerült (' + cs.getName() + '): ' + e);
      }
      if (driveFajl) {
        hivas_('/api/fuvarozas2/gmail/csatolmany', {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify({
            gmailMessageId: kert[i],
            driveFileId: driveFajl.getId(),
            driveUrl: driveFajl.getUrl(),
          }),
        });
      } else {
        hivas_('/api/fuvarozas2/gmail/csatolmany', {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify({
            gmailMessageId: kert[i],
            nev: cs.getName(),
            mimeType: cs.getContentType(),
            base64: Utilities.base64Encode(cs.getBytes()),
          }),
        });
      }
      db++;
    }
  }
  return db;
}

/** 2. kör: az utolsó 3 nap leveleinek metaadata. */
/** A Drive-mappa azonosítója (Script Property MAPPA, különben az alapértelmezett). */
function mappaId_() {
  return PropertiesService.getScriptProperties().getProperty('MAPPA') || ALAP_MAPPA;
}

/** A figyelt címke (Script Property CIMKE, különben az alapértelmezett). */
function cimkeNeve_() {
  return PropertiesService.getScriptProperties().getProperty('CIMKE') || ALAP_CIMKE;
}

/** Ha a pontos címkenevet keresed: futtasd ezt, és nézd meg a naplót. */
function listazCimkeket() {
  var c = GmailApp.getUserLabels();
  for (var i = 0; i < c.length; i++) Logger.log(c[i].getName() + ' — ' + c[i].getThreads(0, 1).length + ' szál (első oldal)');
  if (c.length === 0) Logger.log('Nincs egyetlen saját címke sem ebben a fiókban.');
}

function ujLevelekBekuldese_(csakProba) {
  var cimke = cimkeNeve_();
  var cimkeObj = GmailApp.getUserLabelByName(cimke);
  if (!cimkeObj) {
    Logger.log('NINCS ILYEN CÍMKE: "' + cimke + '". Futtasd a listazCimkeket függvényt a pontos névért.');
    return { uj: 0, ismert: 0, hiba: 'nincs cimke' };
  }
  var szalak = cimkeObj.getThreads(0, 50);
  var levelek = [];
  for (var i = 0; i < szalak.length && levelek.length < MAX_LEVEL_EGY_KORBEN; i++) {
    var uzenetek = szalak[i].getMessages();
    for (var j = 0; j < uzenetek.length && levelek.length < MAX_LEVEL_EGY_KORBEN; j++) {
      var u = uzenetek[j];
      if (u.getDate().getTime() < Date.now() - VISSZA_NAP * 24 * 3600 * 1000) continue;
      if (kizart_(u)) continue;
      var cim = emailCim_(u.getFrom());
      if (cim.indexOf('wellwornpallet') === 0 || cim === 'bzol33@gmail.com') continue; // a saját kimenő levelünk
      var nevek = [];
      var csatolmanyok = u.getAttachments({ includeInlineImages: false, includeAttachments: true });
      for (var k = 0; k < csatolmanyok.length; k++) nevek.push(csatolmanyok[k].getName());
      levelek.push({
        gmailMessageId: u.getId(),
        gmailThreadId: szalak[i].getId(),
        felado: cim,
        feladoNev: feladoNev_(u.getFrom()),
        cimzettek: String(u.getTo() || '').split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean),
        targy: u.getSubject(),
        snippet: String(u.getPlainBody() || '').replace(/\s+/g, ' ').slice(0, 400),
        erkezett: u.getDate().toISOString(),
        szalElso: j === 0,
        csatolmanyNevek: nevek,
      });
    }
  }
  if (csakProba) {
    Logger.log('Címke: "' + cimke + '" · küldendő levelek: ' + levelek.length);
    for (var m = 0; m < Math.min(levelek.length, 10); m++) {
      Logger.log(levelek[m].erkezett + ' | ' + levelek[m].felado + ' | ' + levelek[m].targy + ' | csat: ' + levelek[m].csatolmanyNevek.join(', '));
    }
    return { proba: true, darab: levelek.length };
  }
  if (levelek.length === 0) return { uj: 0, ismert: 0 };
  return hivas_('/api/fuvarozas2/gmail/levelek', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ levelek: levelek }),
  });
}

/** Ez fut 5 percenként. */
function fuvarFigyelo() {
  var kertek = hivas_('/api/fuvarozas2/gmail/kert', { method: 'get' });
  // Előbb a szöveg, utána a csatolmány: a beolvasás így a kettőt együtt látja.
  var torzs = kertTorzsekBekuldese_(kertek.torzs || []);
  var csatolmany = kertCsatolmanyokFeltoltese_(kertek.kert || []);
  var eredmeny = ujLevelekBekuldese_(false);
  Logger.log('levélszöveg: ' + torzs + ' · feltöltött csatolmány: ' + csatolmany + ' · új levél: ' + (eredmeny.uj || 0) + ' · ismert: ' + (eredmeny.ismert || 0));
}

/** Először ezt futtasd: nem küld semmit, csak kiírja, mit látna. */
function egyszeriProba() {
  Logger.log(ujLevelekBekuldese_(true));
}

function telepitIdozitot() {
  torolIdozitot();
  ScriptApp.newTrigger('fuvarFigyelo').timeBased().everyMinutes(5).create();
  Logger.log('Időzítő telepítve: 5 percenként.');
}

function torolIdozitot() {
  var t = ScriptApp.getProjectTriggers();
  for (var i = 0; i < t.length; i++) {
    if (t[i].getHandlerFunction() === 'fuvarFigyelo') ScriptApp.deleteTrigger(t[i]);
  }
}
