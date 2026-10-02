"use client";

import { useRef } from "react";

// Visszalépés lapozással: a képernyő BAL SZÉLÉRŐL jobbra húzva ugyanaz
// történik, mint a fejléc nyilával — natív app-szerű mozdulat, kesztyűben is
// eltalálható. Csak a szélső sávból (SAV_PX) indulhat, hogy a listák
// görgetését és a lehúzásra frissítést ne zavarja; a mozdulatot vízszintesnek
// kell szánni (legalább MIN_DX vízszintesen, legfeljebb MAX_DY függőlegesen).
//
// Egy helyen tartjuk, mert két nézet használja: a dolgozói mobil képernyők
// kerete (components/erkezes/erkezes-sajat-view.tsx Shell) és a felvásárlás
// oldal, ahol Budaházi Zoltán kérésére NINCS vissza nyíl, csak ez a mozdulat
// (2026-10-02).
const SAV_PX = 48;
const MIN_DX = 70;
const MAX_DY = 60;

export function useSzelHuzas(onBack: (() => void) | undefined) {
  const kezdet = useRef<{ x: number; y: number } | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    kezdet.current = t && t.clientX <= SAV_PX ? { x: t.clientX, y: t.clientY } : null;
  }

  function onTouchEnd(e: React.TouchEvent) {
    const k = kezdet.current;
    kezdet.current = null;
    if (!k || !onBack) return;
    const t = e.changedTouches[0];
    if (!t) return;
    if (t.clientX - k.x > MIN_DX && Math.abs(t.clientY - k.y) < MAX_DY) onBack();
  }

  // Ha nincs hova visszalépni, egyáltalán nem kötünk kezelőt az elemre.
  return onBack ? { onTouchStart, onTouchEnd } : {};
}
