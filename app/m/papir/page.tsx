import { redirect } from "next/navigation";

// A „Papír” fül megszűnt (2026-09-24) — a régi könyvjelzők a Postára visznek.
export default function Page() {
  redirect("/m/posta");
}
