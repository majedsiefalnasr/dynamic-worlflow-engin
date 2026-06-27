import { describe, expect, test } from "vitest";
import { mapHttpError, networkError, isDomainError } from "./errors";

describe("mapHttpError", () => {
  test("422 with errors map → validation + fields", () => {
    const e = mapHttpError(422, { message: "Invalid", errors: { name: ["required"] } });
    expect(e.kind).toBe("validation");
    expect(e.fields).toEqual({ name: ["required"] });
    expect(e.message).toBe("Invalid");
  });

  test("409 → conflict", () => {
    expect(mapHttpError(409, { message: "stale" }).kind).toBe("conflict");
  });

  test("body code STALE_RESOURCE → conflict even if status 200-ish wrapper", () => {
    expect(mapHttpError(400, { code: "STALE_RESOURCE", message: "x" }).kind).toBe("conflict");
  });

  test("403 → forbidden", () => {
    expect(mapHttpError(403, { message: "no" }).kind).toBe("forbidden");
  });

  test("406 text/html (WAF) → blocked", () => {
    expect(mapHttpError(406, "<html>blocked</html>", "text/html").kind).toBe("blocked");
  });

  test("401 → unauthorized", () => {
    expect(mapHttpError(401, { message: "expired" }).kind).toBe("unauthorized");
  });

  test("500 → network", () => {
    expect(mapHttpError(500, { message: "boom" }).kind).toBe("network");
  });

  test("teapot 418 → unknown, never leaks raw body to message blindly", () => {
    const e = mapHttpError(418, { weird: true });
    expect(e.kind).toBe("unknown");
    expect(typeof e.message).toBe("string");
  });

  test("preserves diagnostics in meta, never in kind logic", () => {
    const e = mapHttpError(409, { message: "x", code: "STALE_RESOURCE", request_id: "req-1" });
    expect(e.meta?.status).toBe(409);
    expect(e.meta?.code).toBe("STALE_RESOURCE");
    expect(e.meta?.requestId).toBe("req-1");
  });
});

describe("networkError / isDomainError", () => {
  test("networkError → kind network with cause", () => {
    const e = networkError(new Error("fetch failed"));
    expect(e.kind).toBe("network");
    expect(e.meta?.cause).toBeInstanceOf(Error);
  });

  test("isDomainError true for mapped, false for plain Error", () => {
    expect(isDomainError(mapHttpError(403, {}))).toBe(true);
    expect(isDomainError(new Error("x"))).toBe(false);
  });
});
