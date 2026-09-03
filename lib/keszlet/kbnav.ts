import type { KeyboardEvent } from "react";

/**
 * Shared keyboard navigation for data-entry grids/forms.
 *
 * Usage: mark a wrapping element with `data-kbnav-group`, each field
 * (Input, SelectTrigger, ...) with `data-kbnav-item` and `onKeyDown={kbNav}`,
 * and — optionally — the form's primary submit button with `data-kbnav-submit`.
 *
 * - Enter moves focus to the next field, or clicks the submit button from
 *   the last field.
 * - ArrowRight/ArrowLeft move focus to the next/previous field, but only
 *   when the caret is already at the end/start of the current text value
 *   (so normal in-field cursor movement while editing still works).
 */
export function kbNav(e: KeyboardEvent<HTMLElement>) {
  const key = e.key;
  if (key !== "Enter" && key !== "ArrowLeft" && key !== "ArrowRight") return;

  const target = e.currentTarget as HTMLInputElement;
  const group = target.closest<HTMLElement>("[data-kbnav-group]");
  if (!group) return;

  if (key === "ArrowLeft" || key === "ArrowRight") {
    let start: number | null = null;
    let end: number | null = null;
    try {
      start = target.selectionStart;
      end = target.selectionEnd;
    } catch {
      // Some input types (e.g. type="number") don't support selection APIs.
      start = null;
      end = null;
    }
    const length = target.value?.length ?? 0;
    if (typeof start === "number" && typeof end === "number") {
      if (key === "ArrowLeft" && !(start === 0 && end === 0)) return;
      if (key === "ArrowRight" && !(start === length && end === length)) return;
    }
  }

  const items = Array.from(
    group.querySelectorAll<HTMLElement>("[data-kbnav-item]")
  ).filter((el) => !(el as HTMLInputElement).disabled);

  const idx = items.indexOf(target);
  if (idx === -1) return;

  if (key === "ArrowLeft") {
    if (idx > 0) {
      e.preventDefault();
      items[idx - 1].focus();
    }
    return;
  }

  if (key === "ArrowRight") {
    if (idx < items.length - 1) {
      e.preventDefault();
      items[idx + 1].focus();
    }
    return;
  }

  // Enter
  e.preventDefault();
  if (idx < items.length - 1) {
    items[idx + 1].focus();
  } else {
    const submit = group.querySelector<HTMLButtonElement>("[data-kbnav-submit]");
    submit?.click();
  }
}
