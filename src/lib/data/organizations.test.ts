import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./http";
import { toOrgRecord, organizationKeys, updateOrganization } from "./organizations";

vi.mock("./http", () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("toOrgRecord", () => {
  test("maps full DTO -> domain record", () => {
    const record = toOrgRecord({
      id: 42,
      code: "central_bank",
      name: "البنك المركزي",
      category: "banks",
      is_active: true,
      is_system: false,
      version: 5,
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
      code: "misc",
      name: "متنوع",
      category: "other",
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

describe("updateOrganization", () => {
  test("fetches current version before patching when list row has no version", async () => {
    vi.mocked(api.get).mockResolvedValue({
      id: 7,
      code: "commercial_banks",
      name: "البنوك التجارية",
      category: "banks",
      is_active: true,
      is_system: true,
      version: 4,
    });
    vi.mocked(api.patch).mockResolvedValue({
      id: 7,
      code: "commercial_banks",
      name: "البنوك التجارية",
      category: "banks",
      is_active: true,
      is_system: true,
      version: 5,
    });

    await updateOrganization({
      id: 7,
      name: "البنوك التجارية",
      metadata: { category: "bank" },
    });

    expect(api.get).toHaveBeenCalledWith("/organizations/7");
    expect(api.patch).toHaveBeenCalledWith("/organizations/7", {
      name: "البنوك التجارية",
      category: "banks",
      version: 4,
    });
  });

  test("reads version from nested live detail response", async () => {
    vi.mocked(api.get).mockResolvedValue({
      organization: {
        id: 7,
        code: "commercial_banks",
        name: "البنوك التجارية",
        category: "banks",
        is_active: true,
        is_system: true,
        version: 4,
      },
    });
    vi.mocked(api.patch).mockResolvedValue({
      id: 7,
      code: "commercial_banks",
      name: "Test Majed",
      category: "banks",
      is_active: true,
      is_system: true,
      version: 5,
    });

    await updateOrganization({
      id: 7,
      name: "Test Majed",
      metadata: { category: "bank" },
    });

    expect(api.patch).toHaveBeenCalledWith("/organizations/7", {
      name: "Test Majed",
      category: "banks",
      version: 4,
    });
  });

  test("falls back to initial version when live detail omits version", async () => {
    vi.mocked(api.get).mockResolvedValue({
      id: 7,
      code: "commercial_banks",
      name: "البنوك التجارية",
      category: "banks",
      is_active: true,
      is_system: true,
    });
    vi.mocked(api.patch).mockResolvedValue({
      id: 7,
      code: "commercial_banks",
      name: "Test Majed",
      category: "banks",
      is_active: true,
      is_system: true,
      version: 2,
    });

    await updateOrganization({
      id: 7,
      name: "Test Majed",
      metadata: { category: "bank" },
    });

    expect(api.patch).toHaveBeenCalledWith("/organizations/7", {
      name: "Test Majed",
      category: "banks",
      version: 1,
    });
  });
});
