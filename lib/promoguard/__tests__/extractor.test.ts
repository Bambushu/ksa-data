import { describe, it, expect } from "vitest";
import { buildExtractionPrompt, parseExtractionResponse } from "../extractor.js";

describe("buildExtractionPrompt", () => {
  it("includes casino slug and date in prompt", () => {
    const prompt = buildExtractionPrompt("test-casino", "Some promo page text here");
    expect(prompt).toContain("test-casino");
    expect(prompt).toContain("time-limited");
    expect(prompt).toContain("SKIP the welcome bonus");
  });
});

describe("parseExtractionResponse", () => {
  it("parses valid JSON array", () => {
    const raw = JSON.stringify([
      {
        title: "Weekend Spins",
        type: "free_spins",
        description: "50 free spins this weekend",
        bonus_value: 10,
        wagering_multiplier: 0,
        starts: "2026-03-22",
        expires: "2026-03-24",
        terms_url: null,
        confidence: 0.9,
      },
    ]);
    const result = parseExtractionResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Weekend Spins");
    expect(result[0].confidence).toBe(0.9);
  });

  it("handles markdown-wrapped JSON", () => {
    const raw = "```json\n[{\"title\":\"Test\",\"type\":\"other\",\"description\":\"d\",\"bonus_value\":null,\"wagering_multiplier\":null,\"starts\":null,\"expires\":null,\"terms_url\":null,\"confidence\":0.8}]\n```";
    const result = parseExtractionResponse(raw);
    expect(result).toHaveLength(1);
  });

  it("returns empty array for empty JSON array", () => {
    expect(parseExtractionResponse("[]")).toEqual([]);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseExtractionResponse("not json")).toThrow();
  });

  it("filters out entries with confidence below 0.5", () => {
    const raw = JSON.stringify([
      { title: "Good", type: "other", description: "d", bonus_value: null, wagering_multiplier: null, starts: null, expires: null, terms_url: null, confidence: 0.9 },
      { title: "Bad", type: "other", description: "d", bonus_value: null, wagering_multiplier: null, starts: null, expires: null, terms_url: null, confidence: 0.3 },
    ]);
    const result = parseExtractionResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Good");
  });
});
