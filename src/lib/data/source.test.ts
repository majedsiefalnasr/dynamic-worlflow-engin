import { afterEach, describe, expect, test, vi } from "vitest";

// source.ts reads import.meta.env; stub per-test then re-import fresh.
async function load(env: Record<string, string>) {
  vi.resetModules();
  vi.stubEnv("VITE_API_BASE_URL", env.VITE_API_BASE_URL ?? "");
  vi.stubEnv("VITE_API_RESOURCES", env.VITE_API_RESOURCES ?? "");
  return import("./source");
}

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("source()", () => {
  test("no base URL → everything mock", async () => {
    const m = await load({ VITE_API_RESOURCES: "merchants" });
    expect(m.hasApiBase()).toBe(false);
    expect(m.source("merchants")).toBe("mock");
  });

  test("base set, resource listed → live", async () => {
    const m = await load({ VITE_API_BASE_URL: "/api/v1", VITE_API_RESOURCES: "merchants,banks" });
    expect(m.source("merchants")).toBe("live");
    expect(m.source("teams")).toBe("mock");
  });

  test("base set, '*' → all supported live", async () => {
    const m = await load({ VITE_API_BASE_URL: "/api/v1", VITE_API_RESOURCES: "*" });
    expect(m.source("teams")).toBe("live");
    expect(m.source("workflows")).toBe("live");
  });

  test("assertResourceEnv throws on unknown resource name", async () => {
    const m = await load({ VITE_API_BASE_URL: "/api/v1", VITE_API_RESOURCES: "merchants,bogus" });
    expect(() => m.assertResourceEnv()).toThrow(/bogus/);
  });

  test("assertResourceEnv accepts '*' and known names", async () => {
    const m = await load({ VITE_API_BASE_URL: "/api/v1", VITE_API_RESOURCES: "*" });
    expect(() => m.assertResourceEnv()).not.toThrow();
  });
});
