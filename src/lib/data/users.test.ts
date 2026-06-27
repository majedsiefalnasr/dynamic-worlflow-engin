import { describe, expect, test } from "vitest";
import { userKeys } from "./users";

// toUser is already thoroughly tested in auth.test.ts (same mapper).
// We only test the query key factory here.

describe("userKeys factory", () => {
  test("root / lists / list / details / detail shape", () => {
    expect(userKeys.all).toEqual(["users"]);
    expect(userKeys.lists()).toEqual(["users", "list"]);
    expect(userKeys.list({ bankId: 3 })).toEqual(["users", "list", { bankId: 3 }]);
    expect(userKeys.list()).toEqual(["users", "list", {}]);
    expect(userKeys.details()).toEqual(["users", "detail"]);
    expect(userKeys.detail(7)).toEqual(["users", "detail", 7]);
  });

  test("list with multiple filters", () => {
    expect(userKeys.list({ bankId: 1, roleCode: "rc_bank_admin", search: "أحمد" })).toEqual([
      "users",
      "list",
      { bankId: 1, roleCode: "rc_bank_admin", search: "أحمد" },
    ]);
  });
});
