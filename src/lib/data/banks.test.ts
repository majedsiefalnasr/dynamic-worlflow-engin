import { describe, expect, test } from "vitest";
import { toBankEntity, bankKeys } from "./banks";

describe("toBankEntity", () => {
  test("maps full DTO -> domain record", () => {
    const record = toBankEntity({
      id: 1,
      code: "ybrd",
      name: "البنك اليمني للإنشاء والتعمير",
      license_number: "BNK-001",
      swift_code: "YBRDYESA",
      status: "active",
      version: 3,
    });
    expect(record).toEqual({
      id: 1,
      code: "ybrd",
      name: "البنك اليمني للإنشاء والتعمير",
      licenseNumber: "BNK-001",
      swiftCode: "YBRDYESA",
      status: "active",
      _version: 3,
    });
  });

  test("missing optional fields default correctly", () => {
    const record = toBankEntity({
      id: 5,
      code: "test_bank",
      name: "بنك تجريبي",
      status: "inactive",
    });
    expect(record).toEqual({
      id: 5,
      code: "test_bank",
      name: "بنك تجريبي",
      licenseNumber: undefined,
      swiftCode: undefined,
      status: "inactive",
      _version: undefined,
    });
  });
});

describe("bankKeys factory", () => {
  test("root / lists / list / details / detail shape", () => {
    expect(bankKeys.all).toEqual(["banks"]);
    expect(bankKeys.lists()).toEqual(["banks", "list"]);
    expect(bankKeys.list({ status: "active" })).toEqual(["banks", "list", { status: "active" }]);
    expect(bankKeys.list()).toEqual(["banks", "list", {}]);
    expect(bankKeys.details()).toEqual(["banks", "detail"]);
    expect(bankKeys.detail(7)).toEqual(["banks", "detail", 7]);
  });
});
