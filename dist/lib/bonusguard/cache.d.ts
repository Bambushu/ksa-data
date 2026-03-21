import type { CacheStore, CacheEntry } from "./types.js";
export declare function readCache(cachePath?: string): CacheStore;
export declare function writeCache(store: CacheStore, cachePath?: string): void;
export declare function getCacheEntry(store: CacheStore, casinoId: string, contentHash: string, maxAgeDays?: number): CacheEntry | undefined;
export declare function setCacheEntry(store: CacheStore, casinoId: string, entry: CacheEntry): void;
//# sourceMappingURL=cache.d.ts.map