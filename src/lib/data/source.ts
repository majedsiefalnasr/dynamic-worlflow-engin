// ============================================================
// Mock-vs-live resource switch (spec §4). Lives entirely in the
// data layer — screens never read env. Per-resource opt-in via
// VITE_API_RESOURCES (comma list or "*"). Unknown names fail fast
// in dev so a typo can't silently leave a screen on mock.
// ============================================================

export const SUPPORTED = [
  "reference-data",
  "organizations",
  "teams",
  "roles",
  "banks",
  "merchants",
  "reports",
  "audit",
  "notifications",
  "requests",
  "workflows",
  "users",
] as const;

export type Resource = (typeof SUPPORTED)[number];

function getBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");
}

function parseEnv(): Set<string> {
  return new Set(
    (import.meta.env.VITE_API_RESOURCES ?? "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean),
  );
}

export function hasApiBase(): boolean {
  return getBaseUrl().length > 0;
}

export function source(resource: Resource): "mock" | "live" {
  if (!hasApiBase()) return "mock";
  const list = parseEnv();
  if (list.has("*")) return "live";
  return list.has(resource) ? "live" : "mock";
}

/** Throw in dev if VITE_API_RESOURCES names an unsupported resource. Call once at startup. */
export function assertResourceEnv(): void {
  const list = parseEnv();
  const supported = new Set<string>(SUPPORTED);
  for (const name of list) {
    if (name === "*") continue;
    if (!supported.has(name)) {
      const msg = `VITE_API_RESOURCES contains unsupported resource "${name}". Supported: ${SUPPORTED.join(", ")}.`;
      if (import.meta.env.DEV) throw new Error(msg);
      else console.error(msg);
    }
  }
}
