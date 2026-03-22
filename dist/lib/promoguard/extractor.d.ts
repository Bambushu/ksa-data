import type { ExtractedPromo } from "./types.js";
/** Aggressive HTML cleaner for promo pages. Strips more noise than BonusGuard's cleanHtml. */
export declare function cleanPromoHtml(html: string): string;
export declare function buildExtractionPrompt(casinoSlug: string, pageText: string): string;
export declare function parseExtractionResponse(raw: string): ExtractedPromo[];
export declare function extractPromotions(casinoSlug: string, pageText: string): Promise<ExtractedPromo[]>;
//# sourceMappingURL=extractor.d.ts.map