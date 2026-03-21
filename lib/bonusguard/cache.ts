import fs from "node:fs";
import path from "node:path";
import type { CacheStore, CacheEntry } from "./types.js";

const DEFAULT_PATH = path.join(process.cwd(), ".bonusguard", "cache.json");

export function readCache(cachePath: string = DEFAULT_PATH): CacheStore {
  try {
    const raw = fs.readFileSync(cachePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function writeCache(store: CacheStore, cachePath: string = DEFAULT_PATH): void {
  const dir = path.dirname(cachePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(store, null, 2));
}

export function getCacheEntry(store: CacheStore, casinoId: string, contentHash: string, maxAgeDays?: number): CacheEntry | undefined {
  const entry = store[casinoId];
  if (!entry) return undefined;
  if (entry.content_hash !== contentHash) return undefined;
  if (maxAgeDays !== undefined) {
    const age = Date.now() - new Date(entry.extracted_at).getTime();
    if (age > maxAgeDays * 24 * 60 * 60 * 1000) return undefined;
  }
  return entry;
}

export function setCacheEntry(store: CacheStore, casinoId: string, entry: CacheEntry): void {
  store[casinoId] = entry;
}
