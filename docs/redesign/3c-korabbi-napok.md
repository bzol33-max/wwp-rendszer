# Redesign – 3c: Készlet havi fül – „Korábbi napok” felugró ablakba (a felhasználó kérése, 2026-10-29)

Branch: `redesign/3c` (main-ről). NE pusholj, NE deployolj. Csak `components/keszlet/nyiregyhaza-havi.tsx` asztali (768 px feletti) ága változik; a mobil ág érintetlen.

- A bal alsó „Korábbi napok” kártya helyére egy kompakt kártya kerül: cím „Korábbi napok”, alatta az utolsó 3 nap egy-egy sorban („okt. 21., szerda · 380 db”, jobbra „ebből átutalással …” ha van), és egy „Összes korábbi nap megnyitása” gomb (outline).
- A gomb a meglévő `Dialog` komponenssel (components/ui/dialog) nyit egy ablakot (max-w kb. 720 px, max-h 80vh, belül görgethető), benne PONTOSAN a mostani Korábbi napok tartalom: naponkénti blokkok, típus-chipek, „átutalással” jelölés, × törlés a meglévő függvénnyel, megerősítő dialógussal, jogosultság-ellenőrzéssel (`useCanEdit`) — semmi funkció nem vész el.
- Az így felszabaduló helyet a fölötte lévő „{Hónap} naponta” kártya kapja (a diagram maradhat 170 px; a „A hét napjai” sáv és a kártya lélegezzen), ne maradjon üres folt.
- Ellenőrzés: `npx eslint` a fájlra, `npx tsc --noEmit` (a `helyi/` kiszűrve). Build és böngésző NE.
- Commit: `redesign 3c: Korábbi napok felugró ablakban`. PROGRESS.md egy sor. Röviden az eredményt.
