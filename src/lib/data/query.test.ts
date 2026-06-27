import { describe, expect, test } from "vitest";
import { shouldRetry, mockRead } from "./query";
import { mapHttpError, networkError } from "./errors";

describe("shouldRetry", () => {
  test("never retries forbidden/validation/conflict/blocked/unauthorized", () => {
    for (const status of [403, 422, 409, 401]) {
      expect(shouldRetry(0, mapHttpError(status, {}))).toBe(false);
    }
    expect(shouldRetry(0, mapHttpError(406, "<html>", "text/html"))).toBe(false);
  });

  test("retries network once, not twice", () => {
    expect(shouldRetry(0, networkError(new Error("x")))).toBe(true);
    expect(shouldRetry(1, networkError(new Error("x")))).toBe(false);
  });

  test("does not retry non-DomainError", () => {
    expect(shouldRetry(0, new Error("plain"))).toBe(false);
  });
});

describe("mockRead", () => {
  test("returns async-shaped result with no loading/error", () => {
    const r = mockRead([1, 2, 3]);
    expect(r.data).toEqual([1, 2, 3]);
    expect(r.isLoading).toBe(false);
    expect(r.error).toBeNull();
    expect(() => r.refetch()).not.toThrow();
  });
});
