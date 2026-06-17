import { useSyncExternalStore } from "react";
import { wfStore, type WfUser } from "@/lib/workflow-engine";

// ------------------------------------------------------------
// Engine "current user" — small reactive store so the dynamic
// workflow pages can switch identity without touching the
// legacy auth store. Persists to localStorage.
// ------------------------------------------------------------

const KEY = "wfe:currentUserId";

let currentId: string | null = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const wfAuth = {
  get(): WfUser | null {
    const id = currentId;
    if (!id) return null;
    return wfStore.users.get().find((u) => u.id === id) ?? null;
  },
  setId(id: string | null) {
    currentId = id;
    if (typeof window !== "undefined") {
      if (id) window.localStorage.setItem(KEY, id);
      else window.localStorage.removeItem(KEY);
    }
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useWfUser(): WfUser | null {
  // re-render when user changes OR the users table changes
  useSyncExternalStore((l) => {
    const u1 = wfAuth.subscribe(l);
    const u2 = wfStore.users.subscribe(l);
    return () => { u1(); u2(); };
  }, () => currentId, () => null);
  return wfAuth.get();
}
