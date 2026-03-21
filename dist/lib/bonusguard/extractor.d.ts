import type { ExtractionResult } from "./types.js";
/** Strip HTML to clean text, removing nav/footer/cookie elements. */
export declare function cleanHtml(html: string, maxTokens?: number): string;
export declare function extractBonusData(pageText: string): Promise<ExtractionResult>;
//# sourceMappingURL=extractor.d.ts.map