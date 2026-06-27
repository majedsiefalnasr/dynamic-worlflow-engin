import { describe, expect, test } from "vitest";
import { toUser } from "./auth";

describe("toUser mapper", () => {
  test("maps UserResource DTO to domain User", () => {
    const dto = {
      id: 5,
      version: 2,
      name: "علي القاضي",
      email: "intake@ybank.ye",
      role_id: 3,
      role: { id: 3, code: "rc_bank_intake", name: "موظف الإدخال" },
      role_label: "موظف الإدخال",
      organization: { id: 1, code: "bank", name: "البنوك التجارية" },
      team: { id: 1, code: "team_entry", name: "فريق الإدخال" },
      bank_id: 1,
      bank_name: "البنك اليمني",
      bank: { id: 1, code: "ybank", name: "البنك اليمني" },
      is_active: true,
      screen_permissions: [{ screen: "merchants", capabilities: ["VIEW"] }],
      capabilities: ["VIEW", "CREATE"],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const user = toUser(dto);
    expect(user.id).toBe(5);
    expect(user.roleId).toBe("rc_bank_intake");
    expect(user.roleLabel).toBe("موظف الإدخال");
    expect(user.organization).toEqual({ id: 1, code: "bank", name: "البنوك التجارية" });
    expect(user.bankId).toBe(1);
    expect(user.avatar).toBe("عا");
    expect(user.screenPermissions).toEqual([{ screen: "merchants", capabilities: ["VIEW"] }]);
    expect(user._version).toBe(2);
  });

  test("handles null nested objects", () => {
    const dto = {
      id: 1,
      version: 1,
      name: "تست",
      email: "t@t.com",
      role_id: null,
      role: null,
      role_label: null,
      organization: null,
      team: null,
      bank_id: null,
      bank_name: null,
      bank: null,
      is_active: true,
      screen_permissions: [],
      capabilities: [],
      created_at: null,
      updated_at: null,
    };
    const user = toUser(dto);
    expect(user.role).toBeNull();
    expect(user.organization).toBeNull();
    expect(user.bankId).toBeNull();
    expect(user.roleId).toBe("");
    expect(user.roleLabel).toBe("");
  });
});
