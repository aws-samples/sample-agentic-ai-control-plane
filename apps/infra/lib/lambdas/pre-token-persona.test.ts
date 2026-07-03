import { computePersonaGroupOverride } from "./pre-token-persona";

describe("computePersonaGroupOverride", () => {
  it("returns parsed array when custom:persona_groups is valid JSON", () => {
    const result = computePersonaGroupOverride({
      "custom:persona_groups": '["Designers","Product-Managers"]',
    });
    expect(result).toEqual(["Designers", "Product-Managers"]);
  });

  it("returns empty array when attribute missing", () => {
    expect(computePersonaGroupOverride({})).toEqual([]);
  });

  it("returns empty array when attribute is empty string", () => {
    expect(
      computePersonaGroupOverride({ "custom:persona_groups": "" }),
    ).toEqual([]);
  });

  it("returns empty array when JSON is malformed", () => {
    expect(
      computePersonaGroupOverride({ "custom:persona_groups": "not-json" }),
    ).toEqual([]);
  });

  it("returns empty array when JSON is not an array", () => {
    expect(
      computePersonaGroupOverride({
        "custom:persona_groups": '{"foo":"bar"}',
      }),
    ).toEqual([]);
  });

  it("filters out non-string entries", () => {
    expect(
      computePersonaGroupOverride({
        "custom:persona_groups": '["Designers",42,null,"PMs"]',
      }),
    ).toEqual(["Designers", "PMs"]);
  });

  it("trims whitespace from entries", () => {
    expect(
      computePersonaGroupOverride({
        "custom:persona_groups": '["  Designers  "," PMs "]',
      }),
    ).toEqual(["Designers", "PMs"]);
  });

  it("drops empty string entries after trim", () => {
    expect(
      computePersonaGroupOverride({
        "custom:persona_groups": '["Designers","   ",""]',
      }),
    ).toEqual(["Designers"]);
  });
});
