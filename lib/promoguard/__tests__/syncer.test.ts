import { describe, it, expect } from "vitest";
import { diffPromotions, buildPromotionId, mergeExtractions } from "../syncer.js";
import type { Promotion } from "../../../src/types.js";
import type { ExtractedPromo } from "../types.js";

const promo = (overrides: Partial<Promotion>): Promotion => ({
  id: "test-promo",
  casino_slug: "test-casino",
  title: "Test Promo",
  type: "free_spins",
  description: "Test description",
  starts: "2026-03-20",
  expires: "2026-03-30",
  last_verified: "2026-03-22",
  ...overrides,
});

describe("buildPromotionId", () => {
  it("generates a slug from casino and title", () => {
    const id = buildPromotionId("casino777", "Weekend Special: Area Link Dragon");
    expect(id).toBe("casino777-weekend-special-area-link-dragon");
  });

  it("handles special characters", () => {
    const id = buildPromotionId("711", "\u201410.000 Hacksaw Gaming Toernooi");
    expect(id).toBe("711-10-000-hacksaw-gaming-toernooi");
  });
});

describe("diffPromotions", () => {
  it("detects added promotions", () => {
    const oldPromos: Promotion[] = [];
    const newPromos: Promotion[] = [promo({ id: "new-1", title: "New Promo" })];
    const diff = diffPromotions("test-casino", "Test Casino", oldPromos, newPromos);
    expect(diff.added).toHaveLength(1);
    expect(diff.removed).toHaveLength(0);
  });

  it("detects removed promotions", () => {
    const oldPromos = [promo({ id: "old-1", title: "Old Promo" })];
    const newPromos: Promotion[] = [];
    const diff = diffPromotions("test-casino", "Test Casino", oldPromos, newPromos);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(1);
  });

  it("detects unchanged promotions by id", () => {
    const p = promo({ id: "same-1" });
    const diff = diffPromotions("test-casino", "Test Casino", [p], [p]);
    expect(diff.unchanged).toBe(1);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
  });
});

describe("mergeExtractions", () => {
  it("converts extracted promos to Promotion objects", () => {
    const extracted: ExtractedPromo[] = [{
      title: "Test Promo",
      type: "free_spins",
      description: "Test",
      bonus_value: 10,
      wagering_multiplier: 0,
      starts: "2026-03-22",
      expires: "2026-03-25",
      terms_url: "https://example.com",
      confidence: 0.9,
    }];
    const result = mergeExtractions("test-casino", extracted);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("test-casino-test-promo");
    expect(result[0].casino_slug).toBe("test-casino");
    expect(result[0].last_verified).toBe(new Date().toISOString().slice(0, 10));
  });

  it("uses today as default start date when null", () => {
    const extracted: ExtractedPromo[] = [{
      title: "No Date",
      type: "other",
      description: "d",
      bonus_value: null,
      wagering_multiplier: null,
      starts: null,
      expires: null,
      terms_url: null,
      confidence: 0.8,
    }];
    const result = mergeExtractions("test-casino", extracted);
    expect(result[0].starts).toBe(new Date().toISOString().slice(0, 10));
  });
});
