import { describe, expect, test } from "vitest";
import { toReferenceTable, referenceKeys } from "./reference-data";

describe("toReferenceTable", () => {
  test("maps DTO -> domain, string ids, nested values, version", () => {
    const t = toReferenceTable({
      id: 7,
      key: "sectors",
      label: "Sectors",
      is_system: true,
      version: 3,
      values: [{ id: 11, key: "agri", label: "Agriculture", version: 2 }],
    });
    expect(t).toEqual({
      id: "7",
      key: "sectors",
      label: "Sectors",
      system: true,
      _version: 3,
      values: [{ id: "11", key: "agri", label: "Agriculture", _version: 2 }],
    });
  });

  test("missing values -> empty array, never crash", () => {
    expect(toReferenceTable({ id: 1, key: "k", label: "L" }).values).toEqual([]);
  });
});

describe("referenceKeys factory (spec 3.6)", () => {
  test("root / lists / list / details / detail shape", () => {
    expect(referenceKeys.all).toEqual(["reference-data"]);
    expect(referenceKeys.lists()).toEqual(["reference-data", "list"]);
    expect(referenceKeys.list({ q: "x" })).toEqual(["reference-data", "list", { q: "x" }]);
    expect(referenceKeys.detail("7")).toEqual(["reference-data", "detail", "7"]);
  });
});
