import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { isDomainError } from "./errors";

function jsonResponse(status: number, body: unknown, contentType = "application/json") {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": contentType },
  });
}

let api: typeof import("./http").api;

beforeEach(async () => {
  vi.resetModules();
  ({ api } = await import("./http"));
});
afterEach(() => vi.restoreAllMocks());

describe("api.get unwraps envelope", () => {
  test("{success,message,data} → data", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse(200, { success: true, message: "ok", data: { id: 1 } })),
    );
    await expect(api.get("/thing")).resolves.toEqual({ id: 1 });
  });
});

describe("api.getList returns data + meta", () => {
  test("{data,meta}", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          data: [{ id: 1 }],
          meta: { page: 1, per_page: 20, total: 1, last_page: 1 },
        }),
      ),
    );
    const r = await api.getList("/things");
    expect(r.data).toEqual([{ id: 1 }]);
    expect(r.meta?.total).toBe(1);
  });

  test("{success,message,data:{data,stats}} → data.data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          success: true,
          message: "Teams retrieved.",
          data: {
            data: [{ id: 13, code: "team_alaamlyat-albnky" }],
            stats: { total_teams: 1 },
          },
        }),
      ),
    );
    const r = await api.getList("/teams");
    expect(r.data).toEqual([{ id: 13, code: "team_alaamlyat-albnky" }]);
  });
});

describe("errors map to DomainError", () => {
  test("422 → validation DomainError", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse(422, { message: "bad", errors: { name: ["required"] } })),
    );
    await api.post("/things", {}).catch((e) => {
      expect(isDomainError(e)).toBe(true);
      expect(e.kind).toBe("validation");
    });
    expect.assertions(2);
  });

  test("fetch throw → network DomainError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await api.get("/things").catch((e) => {
      expect(isDomainError(e)).toBe(true);
      expect(e.kind).toBe("network");
    });
    expect.assertions(2);
  });
});
