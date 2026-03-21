import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readCache, writeCache, getCacheEntry, setCacheEntry } from "../cache.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_CACHE_PATH = path.join(__dirname, ".test-cache.json");

describe("cache", () => {
  afterEach(() => {
    if (fs.existsSync(TEST_CACHE_PATH)) fs.unlinkSync(TEST_CACHE_PATH);
  });

  it("returns empty object when cache file does not exist", () => {
    const cache = readCache(TEST_CACHE_PATH);
    expect(cache).toEqual({});
  });

  it("round-trips cache entries", () => {
    const entry = {
      content_hash: "abc123",
      extracted_at: "2026-03-20T00:00:00Z",
      extraction: {
        bonus_available: { value: true, confidence: 1 },
        match_percentage: { value: 100, confidence: 0.9 },
        max_bonus_eur: { value: 200, confidence: 0.9 },
        wagering_requirement: { value: 30, confidence: 0.8 },
        wagering_applies_to: { value: "bonus", confidence: 0.8 },
        bonus_type: { value: "deposit_match", confidence: 0.9 },
        free_spins: { value: 0, confidence: 0.7 },
        min_deposit_eur: { value: 10, confidence: 0.9 },
        time_limit_days: { value: 30, confidence: 0.8 },
        max_cashout_eur: { value: null, confidence: 0.5 },
      },
    };
    const store = {};
    setCacheEntry(store, "test-casino", entry);
    writeCache(store, TEST_CACHE_PATH);
    const loaded = readCache(TEST_CACHE_PATH);
    expect(getCacheEntry(loaded, "test-casino", "abc123")).toEqual(entry);
  });

  it("returns undefined for hash mismatch", () => {
    const entry = { content_hash: "abc123", extracted_at: "2026-03-20T00:00:00Z", extraction: {} as any };
    const store = {};
    setCacheEntry(store, "test-casino", entry);
    expect(getCacheEntry(store, "test-casino", "different-hash")).toBeUndefined();
  });

  it("returns undefined for expired cache entry", () => {
    const entry = { content_hash: "abc123", extracted_at: "2025-01-01T00:00:00Z", extraction: {} as any };
    const store = {};
    setCacheEntry(store, "test-casino", entry);
    expect(getCacheEntry(store, "test-casino", "abc123", 30)).toBeUndefined();
  });
});
