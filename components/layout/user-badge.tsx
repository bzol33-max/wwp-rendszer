"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { getCurrentUser, setCurrentUser } from "@/lib/current-user";

/**
 * Oldalsávban megjelenő "ki vagy" — a névvel bélyegzünk minden ezen a
 * böngészőn rögzített tételt. Első használatkor bekéri a nevet, utána
 * a ceruza ikonnal bármikor módosítható.
 */
export function UserBadge() {
  const [name, setName] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const stored = getCurrentUser();
    setName(stored);
    if (!stored) setEditing(true);
  }, []);

  function save() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setCurrentUser(trimmed);
    setName(trimmed);
    setEditing(false);
  }

  if (name === null) {
    return null;
  }

  if (editing) {
    return (
      <div className="px-3 pb-2">
        <div className="mb-1 text-[11px] text-sidebar-foreground/50">Ki vagy?</div>
        <div className="flex gap-1">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="Neved"
            className="w-full min-w-0 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2 py-1 text-xs text-white outline-none placeholder:text-sidebar-foreground/40"
          />
          <button
            type="button"
            onClick={save}
            className="shrink-0 rounded-md bg-sidebar-accent px-2 text-xs text-white"
          >
            OK
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(name);
        setEditing(true);
      }}
      className="flex items-center justify-between px-3 pb-2 text-xs text-sidebar-foreground/70 hover:text-white"
    >
      <span className="truncate">👤 {name}</span>
      <Pencil className="h-3 w-3 shrink-0" />
    </button>
  );
}
