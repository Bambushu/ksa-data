import { describe, it, expect } from "vitest";
import { buildFieldRegex, applyFieldUpdate } from "../field-updater.js";

describe("buildFieldRegex", () => {
  it("matches numeric fields in casino object", () => {
    const regex = buildFieldRegex("holland-casino-online", "wagering_requirement");
    const source = `  "holland-casino-online": {\n    welcome_bonus: {\n      wagering_requirement: 24,`;
    expect(regex.test(source)).toBe(true);
  });
});

describe("applyFieldUpdate", () => {
  it("replaces a numeric value in the correct casino block", () => {
    const source = [
      '"test-casino": {',
      '    welcome_bonus: {',
      '      wagering_requirement: 24,',
      '    }',
      '}',
    ].join("\n");
    const result = applyFieldUpdate(source, "test-casino", "wagering_requirement", 30);
    expect(result).toContain("wagering_requirement: 30,");
    expect(result).not.toContain("wagering_requirement: 24,");
  });

  it("replaces a boolean value", () => {
    const source = '"test-casino": {\n    welcome_bonus: {\n      bonus_available: true,';
    const result = applyFieldUpdate(source, "test-casino", "bonus_available", false);
    expect(result).toContain("bonus_available: false,");
  });
});
