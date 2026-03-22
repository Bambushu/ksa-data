import fs from "node:fs";
import path from "node:path";
/** Generate a deterministic ID from casino slug + title */
export function buildPromotionId(casinoSlug, title) {
    const slug = title
        .toLowerCase()
        .replace(/[€$£]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    return `${casinoSlug}-${slug}`;
}
/** Convert extracted promos to Promotion objects */
export function mergeExtractions(casinoSlug, extracted) {
    const today = new Date().toISOString().slice(0, 10);
    return extracted.map((e) => ({
        id: buildPromotionId(casinoSlug, e.title),
        casino_slug: casinoSlug,
        title: e.title,
        type: e.type,
        description: e.description,
        ...(e.bonus_value != null && { bonus_value: e.bonus_value }),
        ...(e.wagering_multiplier != null && { wagering_multiplier: e.wagering_multiplier }),
        starts: e.starts ?? today,
        expires: e.expires ?? "2099-12-31", // Ongoing promo — no known end date
        ...(e.terms_url != null && { terms_url: e.terms_url }),
        last_verified: today,
    }));
}
/** Diff old vs new promotions for a single casino */
export function diffPromotions(casinoSlug, casinoName, oldPromos, newPromos) {
    const oldIds = new Set(oldPromos.map((p) => p.id));
    const newIds = new Set(newPromos.map((p) => p.id));
    const added = newPromos.filter((p) => !oldIds.has(p.id));
    const removed = oldPromos.filter((p) => !newIds.has(p.id));
    const unchanged = newPromos.filter((p) => oldIds.has(p.id)).length;
    return { casino_slug: casinoSlug, casino_name: casinoName, added, removed, unchanged };
}
/** Write the full promotions array to src/promotions.ts */
export function writePromotions(allPromos) {
    // Sort by casino, then by expiry
    allPromos.sort((a, b) => {
        if (a.casino_slug !== b.casino_slug)
            return a.casino_slug.localeCompare(b.casino_slug);
        return a.expires.localeCompare(b.expires);
    });
    const lines = [
        'import type { Promotion } from "./types.js";',
        'import { promotionsArraySchema } from "./schemas.js";',
        "",
        "export const promotions: Promotion[] = " + JSON.stringify(allPromos, null, 2) + ";",
        "",
        "promotionsArraySchema.parse(promotions);",
        "",
    ];
    const filePath = path.join(process.cwd(), "src", "promotions.ts");
    fs.writeFileSync(filePath, lines.join("\n"));
}
//# sourceMappingURL=syncer.js.map