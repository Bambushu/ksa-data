import type { Promotion } from "../../src/types.js";
import type { ExtractedPromo, PromoDiff } from "./types.js";
/** Generate a deterministic ID from casino slug + title */
export declare function buildPromotionId(casinoSlug: string, title: string): string;
/** Convert extracted promos to Promotion objects */
export declare function mergeExtractions(casinoSlug: string, extracted: ExtractedPromo[]): Promotion[];
/** Diff old vs new promotions for a single casino */
export declare function diffPromotions(casinoSlug: string, casinoName: string, oldPromos: Promotion[], newPromos: Promotion[]): PromoDiff;
/** Write the full promotions array to src/promotions.ts */
export declare function writePromotions(allPromos: Promotion[]): void;
//# sourceMappingURL=syncer.d.ts.map