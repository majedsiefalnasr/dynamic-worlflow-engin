import { describe, expect, test } from "vitest";
import { toOrgRecord, organizationKeys } from "./organizations";

describe("toOrgRecord", () => {
  test("maps full DTO -> domain record", () => {
    const record = toOrgRecord({
      id: 42,
      slug: "central_bank",
      name: "البنك المركزي",
      is_active: true,
      is_system: false,
      version: 5,
      metadata: { category: "bank" },
    });
    expect(record).toEqual({
      id: 42,
      code: "central_bank",
      label: "البنك المركزي",
      category: "bank",
      active: true,
      builtin: false,
      _version: 5,
    });
  });

  test("missing optional fields default correctly", () => {
    const record = toOrgRecord({
      id: 1,
      slug: "misc",
      name: "متنوع",
      is_active: false,
      is_system: true,
    });
    expect(record).toEqual({
      id: 1,
      code: "misc",
      label: "متنوع",
      category: "other",
      active: false,
      builtin: true,
      _version: undefined,
    });
  });
});

describe("organizationKeys factory", () => {
  test("root / lists / list / details / detail shape", () => {
    expect(organizationKeys.all).toEqual(["organizations"]);
    expect(organizationKeys.lists()).toEqual(["organizations", "list"]);
    expect(organizationKeys.list({ active: true })).toEqual([
      "organizations",
      "list",
      { active: true },
    ]);
    expect(organizationKeys.list()).toEqual(["organizations", "list", {}]);
    expect(organizationKeys.details()).toEqual(["organizations", "detail"]);
    expect(organizationKeys.detail(7)).toEqual(["organizations", "detail", 7]);
  });
});
