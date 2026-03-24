import { describe, it, expect } from "vitest";
import { classifyMismatches } from "../auto-update-rules.js";

describe("classifyMismatches", () => {
  it("auto-updates medium priority at 0.9+ confidence", () => {
    const result = classifyMismatches([{
      casino_id: "test", casino_name: "Test", terms_url: "",
      field: "free_spins", our_value: 100, site_value: 200,
      priority: "medium", confidence: 0.95,
    }]);
    expect(result.autoUpdate).toHaveLength(1);
    expect(result.flagged).toHaveLength(0);
  });

  it("auto-updates high priority at 0.9+ confidence", () => {
    const result = classifyMismatches([{
      casino_id: "test", casino_name: "Test", terms_url: "",
      field: "match_percentage", our_value: 100, site_value: 150,
      priority: "high", confidence: 0.92,
    }]);
    expect(result.autoUpdate).toHaveLength(1);
    expect(result.flagged).toHaveLength(0);
  });

  it("never auto-updates bonus_available (critical)", () => {
    const result = classifyMismatches([{
      casino_id: "test", casino_name: "Test", terms_url: "",
      field: "bonus_available", our_value: true, site_value: false,
      priority: "critical", confidence: 0.99,
    }]);
    expect(result.autoUpdate).toHaveLength(0);
    expect(result.flagged).toHaveLength(1);
  });

  it("flags 0.7-0.9 confidence for review", () => {
    const result = classifyMismatches([{
      casino_id: "test", casino_name: "Test", terms_url: "",
      field: "max_bonus_eur", our_value: 200, site_value: 300,
      priority: "high", confidence: 0.82,
    }]);
    expect(result.autoUpdate).toHaveLength(0);
    expect(result.flagged).toHaveLength(1);
  });

  it("skips low confidence entirely", () => {
    const result = classifyMismatches([{
      casino_id: "test", casino_name: "Test", terms_url: "",
      field: "wagering_requirement", our_value: 30, site_value: 25,
      priority: "low", confidence: 0.5,
    }]);
    expect(result.autoUpdate).toHaveLength(0);
    expect(result.flagged).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
  });
});
