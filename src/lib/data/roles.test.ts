import { describe, expect, test } from "vitest";
import { toRoleCatalogEntry, roleKeys } from "./roles";

describe("toRoleCatalogEntry", () => {
  test("maps full DTO -> domain record", () => {
    const record = toRoleCatalogEntry({
      id: 7,
      code: "rc_auditor",
      name: "مدقق أول",
      organization: { id: 1, code: "bank", name: "البنوك التجارية" },
      organization_id: 1,
      is_active: true,
      is_system: false,
      version: 2,
    });
    expect(record).toEqual({
      id: 7,
      code: "rc_auditor",
      name: "مدقق أول",
      orgId: 1,
      orgCode: "bank",
      active: true,
      builtin: false,
      _version: 2,
    });
  });

  test("missing optional fields default correctly", () => {
    const record = toRoleCatalogEntry({
      id: 3,
      code: "rc_viewer",
      name: "مشاهد",
      organization: { id: 2, code: "committee", name: "اللجنة" },
      organization_id: 2,
      is_active: false,
      is_system: true,
    });
    expect(record).toEqual({
      id: 3,
      code: "rc_viewer",
      name: "مشاهد",
      orgId: 2,
      orgCode: "committee",
      active: false,
      builtin: true,
      _version: undefined,
    });
  });
});

describe("roleKeys factory", () => {
  test("root / lists / list / details / detail shape", () => {
    expect(roleKeys.all).toEqual(["roles"]);
    expect(roleKeys.lists()).toEqual(["roles", "list"]);
    expect(roleKeys.list({ orgCode: "bank" })).toEqual(["roles", "list", { orgCode: "bank" }]);
    expect(roleKeys.list()).toEqual(["roles", "list", {}]);
    expect(roleKeys.details()).toEqual(["roles", "detail"]);
    expect(roleKeys.detail(7)).toEqual(["roles", "detail", 7]);
  });
});
