// LocalStorage persistence + tiny reactive store
// Namespace: cby.v2.*  → bump version key to invalidate seeds.

const NS = "cby.v2";
const VERSION_KEY = `${NS}.version`;
const CURRENT_VERSION = "2026-06-17-seed-sync-v2";

const isBrowser = typeof window !== "undefined";

export function dbRead<T>(key: string, fallback: T): T {
  if (!isBrowser) return fallback;
  try {
    const raw = localStorage.getItem(`${NS}.${key}`);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function dbWrite<T>(key: string, value: T): void {
  if (!isBrowser) return;
  try {
    localStorage.setItem(`${NS}.${key}`, JSON.stringify(value));
  } catch {
    /* quota — ignore in prototype */
  }
}

export function dbResetAll(): void {
  if (!isBrowser) return;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (k.startsWith(NS + ".") || k === "cby:users")) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
  localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
}

export function dbCheckVersion(): boolean {
  if (!isBrowser) return true;
  const v = localStorage.getItem(VERSION_KEY);
  if (v !== CURRENT_VERSION) {
    dbResetAll();
    return false;
  }
  return true;
}

// Auto-init on import (browser only)
if (isBrowser) dbCheckVersion();

// ---------- Reactive snapshot helper ----------
// Each mutable collection wraps a value + listeners. Components useSyncExternalStore.
import { useSyncExternalStore } from "react";

export type Cell<T> = {
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  subscribe: (l: () => void) => () => void;
  use: () => T;
};

export function cell<T>(key: string, initial: T): Cell<T> {
  let value = dbRead<T>(key, initial);
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    get: () => value,
    set: (next) => {
      value = typeof next === "function" ? (next as (p: T) => T)(value) : next;
      dbWrite(key, value);
      emit();
    },
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    use() {
      return useSyncExternalStore(
        (l) => this.subscribe(l),
        () => this.get(),
        () => initial,
      );
    },
  };
}
