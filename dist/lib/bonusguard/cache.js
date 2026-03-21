import fs from "node:fs";
import path from "node:path";
const DEFAULT_PATH = path.join(process.cwd(), ".bonusguard", "cache.json");
export function readCache(cachePath = DEFAULT_PATH) {
    try {
        const raw = fs.readFileSync(cachePath, "utf-8");
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
export function writeCache(store, cachePath = DEFAULT_PATH) {
    const dir = path.dirname(cachePath);
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(store, null, 2));
}
export function getCacheEntry(store, casinoId, contentHash, maxAgeDays) {
    const entry = store[casinoId];
    if (!entry)
        return undefined;
    if (entry.content_hash !== contentHash)
        return undefined;
    if (maxAgeDays !== undefined) {
        const age = Date.now() - new Date(entry.extracted_at).getTime();
        if (age > maxAgeDays * 24 * 60 * 60 * 1000)
            return undefined;
    }
    return entry;
}
export function setCacheEntry(store, casinoId, entry) {
    store[casinoId] = entry;
}
//# sourceMappingURL=cache.js.map