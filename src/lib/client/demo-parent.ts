"use client";

// Profil demo tersimpan per TAB lewat sessionStorage — bukan localStorage —
// supaya Parent A dan Parent B bisa dites di dua tab tanpa saling menimpa
// (DESIGN.md §3, TECHNICAL §3.3).

const KEY = "ottodot:selected-parent-id";

export function getStoredParentId(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(KEY);
}

export function setStoredParentId(id: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(KEY, id);
}
