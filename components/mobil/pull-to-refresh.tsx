"use client";

import { useRef, useState, useTransition, type ReactNode, type TouchEvent } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

// Kötelező elem minden önálló, mobilra tervezett nézeten (ld. lib/mobil-
// theme.ts hasonló megjegyzését) — natív app-szerű "lehúzásra frissítés"
// gesztus, könyvtár nélkül (a projektnek nincs erre külön csomagja).
// Csak a legfelső görgetési pozícióból induló, lefelé húzó érintést veszi
// figyelembe (feljebb görgetett listánál a lehúzás sima görgetés marad), a
// tényleges frissítést router.refresh()-szel végzi.
const PULL_THRESHOLD = 64;
const MAX_PULL = 96;

export function PullToRefresh({
  children,
  className,
  indicatorClassName = "text-[var(--mob-muted)]",
}: {
  children: ReactNode;
  className?: string;
  /** A pörgő ikon színe — más --xx-muted tokent használó nézeten (pl. Áttekintés) felülírható. */
  indicatorClassName?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pull, setPull] = useState(0);
  const startY = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  function onTouchStart(e: TouchEvent) {
    if (pending) return;
    const el = containerRef.current;
    startY.current = el && el.scrollTop <= 0 ? e.touches[0].clientY : null;
  }

  function onTouchMove(e: TouchEvent) {
    if (startY.current === null) return;
    const delta = e.touches[0].clientY - startY.current;
    setPull(delta > 0 ? Math.min(delta * 0.5, MAX_PULL) : 0);
  }

  function onTouchEnd() {
    if (startY.current === null) return;
    startY.current = null;
    if (pull >= PULL_THRESHOLD) {
      startTransition(() => router.refresh());
    }
    setPull(0);
  }

  const indicatorHeight = pending ? 40 : pull;

  return (
    <div
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className={`overscroll-y-contain ${className ?? ""}`}
    >
      <div
        className={`flex items-center justify-center overflow-hidden transition-[height] ${indicatorClassName}`}
        style={{ height: indicatorHeight }}
      >
        <RefreshCw className={`h-4 w-4 ${pending || pull >= PULL_THRESHOLD ? "animate-spin" : ""}`} />
      </div>
      {children}
    </div>
  );
}
