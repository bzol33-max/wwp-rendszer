import { ClipboardCheck, Disc3, Droplets, Gauge, Plus, Wrench, type LucideIcon } from "lucide-react";

// Hét nézet B1: a nem-fuvar bejegyzések ikonjai (szerver- és kliens-komponensből is).
const IKON: Record<string, LucideIcon> = {
  szerviz: Wrench, gumis: Disc3, mosas: Droplets, muszaki: ClipboardCheck, tacho: Gauge, egyeb: Plus,
};

export function BejegyzesIkon({ tipus, className }: { tipus: string; className?: string }) {
  const I = IKON[tipus] ?? Plus;
  return <I className={className ?? "size-3.5 shrink-0"} aria-hidden />;
}
