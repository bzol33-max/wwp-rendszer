# Redesign – 6. modul: Jelenlét + Szabadság egy lapon (K2 terv, a felhasználó választása)

Branch: `redesign/6-jelenlet` (main-ről). NE pusholj, NE deployolj. Adatbázis/séma/migráció: semmi. Mobil (768 px alatt, `components/m`, `components/mobil`, dolgozói telefon-nézet) érintetlen.
SZABÁLY: egyetlen meglévő funkció sem veszhet el. A mostani `/jelenlet` (JelenletView: mai jelenlét-sáv, nyitott napok sáv, nap-szerkesztő, havi napló dialógus, telephelyi feladat-üzenőfal kommentekkel/ismétléssel, archívum) és a mostani `/jelenlet/szabadsag` (SzabadsagView: kérelmek jóváhagyása/elutasítása, rögzítés bárkinek, keretek + KeretDialog, közelgő távollétek, éves hőtérkép, évváltás `?ev=`) MINDEN funkciója elérhető marad. Csak a meglévő szerver-akciókat használd (`lib/jelenlet/actions.ts`), új adatot nem találsz ki.

## Cél (K2): a `/jelenlet` asztali nézete egy „Csapat” lap, ahol a szabadság szem előtt van
**Fejléc:** kis szürke sor „{Nap}, {dátum} · N bent · N távol” (a meglévő mai jelenlét-adatból) + cím „Csapat · 4 hét” (24/700). Jobbra: szegmentált „2 hét | 4 hét” kapcsoló, ‹ › lapozás hetenként, fő gomb **„Szabadság rögzítése”** (a meglévő RogzitoSor/rögzítő logika dialógusban vagy lenyíló panelben).
**Kérelmek sáv** (csak ha van függő kérelem; halvány narancs kártya): „N kérelem vár:” + kérelmenként fehér pirula: „{Név} · {időszak} · N nap” + zöld „Jóváhagyom” + „Nem” — a meglévő jóváhagyó/elutasító akciókkal.
**Csapat-rács** (fehér kártya, 0c tokenek): sorok = dolgozók (a meglévő sorrendben/szűréssel), oszlopok = napok 4 (vagy 2) héten át, hetenként csoportosítva kis réssel, a hét fejléce „43. hét · okt. 19–25.” (a mai hét kék háttérrel), alatta napbetű + nap; a mai oszlop kék keretes. Cellák (~34×30 px, radius 7):
- múltbeli/mai munkanapon a ledolgozott idő (pl. „8:50”, zöldes háttér) — a meglévő jelenlét-adatból; a cellára kattintva a meglévő nap-szerkesztő nyílik;
- **Sz** = jóváhagyott szabadság (narancs #FF9500 teli, fehér betű); **k** = kért, még nem jóváhagyott (narancs csíkos); **B** = beteg (lila #AF52DE); hétvége/ünnep szürke („Ü” az ünnepnapon) — a meglévő ünnep/áthelyezett pihenőnap logikával;
- üres jövőbeli munkanap halványszürke.
- Jobb szélen **„Marad”** oszlop: „5/21” (kivehető / keret, a meglévő mérlegből); ha ≤ 3 nap, narancs. A névre kattintva a meglévő havi napló dialógus nyílik, a „Marad” értékre kattintva a meglévő KeretDialog.
- Alatta jelmagyarázat: Szabadság · Kért · Beteg · Hétvége/ünnep.
**Üzenőfal:** a rács alatt telephelyenként egy kártya (Szakoly · Balkány · Nyíregyháza), cím + „N nyitott”, a feladatok listája a meglévő színes pöttyökkel; a meglévő feladat-funkciók (új feladat, komment-dialógus, kész, ismétlés) ugyanúgy működnek (a meglévő `telephely-feladatok-tile` újrahasznosítva).
**Nyitott napok sáv** (ha ma is van ilyen figyelmeztetés): a kérelmek sáv mellé/alá, ugyanabban a stílusban.

## Ami nem fér a lapra
- Az éves hőtérkép, a keretek teljes listája, a közelgő távollétek listája és az évváltás a `/jelenlet/szabadsag` oldalon MARAD; a Csapat lapon egy „Éves nézet ›” link vezet oda (fejléc jobb oldala). A navigációban a „Jelenlét” egy menüpont marad.
- Az archívum linkje (meglévő) a fejlécben marad.

## Stílus
0c tokenek, szövegszínek #1D1D1F / #48484A / #6E6E73, 12 px alatt semmi (a cellákban 12 px), számok `tabular-nums`. A `.jelenlet` saját témájából (acélkék, sötét primary) a szín-alaptokeneket vedd ki, hogy a közös kék séma érvényesüljön (a Fuvarozásnál ugyanígy történt); a modul-specifikus segédváltozók maradhatnak, ha a mobil ág használja őket.

## Ellenőrzés és lezárás
- `npx eslint` a módosított fájlokra, `npx tsc --noEmit` (`helyi/` kiszűrve), `git diff --stat`. Ha van jelenlét/szabadság teszt a `scripts/` alatt, futtasd (`npx tsx`), új tiszta segédfüggvényhez írj tesztet.
- Build és böngésző NE — a felügyelő végzi.
- Commit (a leírással): `redesign 6: Jelenlét + Szabadság egy lapon (K2)`. PROGRESS.md, KIMARADT.md frissítés.
- A végén röviden: módosított fájlok, minden funkció hova került (régi hely → új hely táblázat), mi nem valósult meg és miért, futtatott parancsok.
