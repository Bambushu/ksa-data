import { describe, it, expect } from "vitest";
import { compareBonusData } from "../comparator.js";
import type { BonusRecord, ExtractionResult } from "../types.js";

const baseRecord: BonusRecord = {
  casino_id: "test",
  casino_name: "Test Casino",
  terms_url: "https://test.nl/terms",
  bonus_available: true,
  match_percentage: 100,
  max_bonus_eur: 200,
  wagering_requirement: 30,
  wagering_applies_to: "bonus",
  bonus_type: "deposit_match",
  free_spins: 50,
  min_deposit_eur: 10,
  time_limit_days: 30,
  max_cashout_eur: null,
};

function makeExtraction(overrides: Partial<Record<keyof ExtractionResult, { value: unknown; confidence: number }>> = {}): ExtractionResult {
  const defaults: ExtractionResult = {
    bonus_available: { value: true, confidence: 1 },
    match_percentage: { value: 100, confidence: 0.9 },
    max_bonus_eur: { value: 200, confidence: 0.9 },
    wagering_requirement: { value: 30, confidence: 0.9 },
    wagering_applies_to: { value: "bonus", confidence: 0.8 },
    bonus_type: { value: "deposit_match", confidence: 0.9 },
    free_spins: { value: 50, confidence: 0.8 },
    min_deposit_eur: { value: 10, confidence: 0.9 },
    time_limit_days: { value: 30, confidence: 0.8 },
    max_cashout_eur: { value: null, confidence: 0.5 },
  };
  return { ...defaults, ...overrides } as ExtractionResult;
}

describe("compareBonusData", () => {
  it("returns no mismatches when data matches", () => {
    const result = compareBonusData(baseRecord, makeExtraction());
    expect(result).toEqual([]);
  });

  it("detects wagering_requirement change as HIGH", () => {
    const ext = makeExtraction({ wagering_requirement: { value: 40, confidence: 0.9 } });
    const result = compareBonusData(baseRecord, ext);
    expect(result).toHaveLength(1);
    expect(result[0].field).toBe("wagering_requirement");
    expect(result[0].priority).toBe("high");
    expect(result[0].our_value).toBe(30);
    expect(result[0].site_value).toBe(40);
  });

  it("detects bonus_available=false as CRITICAL", () => {
    const ext = makeExtraction({ bonus_available: { value: false, confidence: 0.95 } });
    const result = compareBonusData(baseRecord, ext);
    expect(result.some((m) => m.priority === "critical")).toBe(true);
  });

  it("reports low-confidence extractions as LOW priority", () => {
    const ext = makeExtraction({ wagering_requirement: { value: 99, confidence: 0.3 } });
    const result = compareBonusData(baseRecord, ext);
    const wagerMatch = result.find((m) => m.field === "wagering_requirement");
    expect(wagerMatch?.priority ?? "low").toBe("low");
  });
});
