import { describe, expect, test } from "vitest";
import { toTeamRecord, teamKeys } from "./teams";

describe("toTeamRecord", () => {
  test("maps full DTO -> domain record", () => {
    const record = toTeamRecord({
      id: 10,
      code: "team_entry",
      name: "فريق الإدخال",
      organization: { id: 1, code: "bank", name: "البنوك التجارية" },
      organization_id: 1,
      is_active: true,
      is_system: false,
      version: 3,
    });
    expect(record).toEqual({
      id: 10,
      code: "team_entry",
      label: "فريق الإدخال",
      orgId: 1,
      orgCode: "bank",
      roleCode: undefined,
      active: true,
      builtin: false,
      _version: 3,
    });
  });

  test("roleCode is always undefined in live mode (BH-03)", () => {
    const record = toTeamRecord({
      id: 5,
      code: "team_fx",
      name: "فريق العمليات",
      organization: { id: 2, code: "committee", name: "اللجنة" },
      organization_id: 2,
      is_active: false,
      is_system: true,
    });
    expect(record.roleCode).toBeUndefined();
    expect(record).toEqual({
      id: 5,
      code: "team_fx",
      label: "فريق العمليات",
      orgId: 2,
      orgCode: "committee",
      roleCode: undefined,
      active: false,
      builtin: true,
      _version: undefined,
    });
  });
});

describe("teamKeys factory", () => {
  test("root / lists / list / details / detail shape", () => {
    expect(teamKeys.all).toEqual(["teams"]);
    expect(teamKeys.lists()).toEqual(["teams", "list"]);
    expect(teamKeys.list({ orgCode: "bank" })).toEqual(["teams", "list", { orgCode: "bank" }]);
    expect(teamKeys.list()).toEqual(["teams", "list", {}]);
    expect(teamKeys.details()).toEqual(["teams", "detail"]);
    expect(teamKeys.detail(7)).toEqual(["teams", "detail", 7]);
  });
});
