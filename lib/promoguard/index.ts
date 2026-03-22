export { extractPromotions, buildExtractionPrompt, parseExtractionResponse, cleanPromoHtml } from "./extractor.js";
export { buildPromotionId, mergeExtractions, diffPromotions, writePromotions } from "./syncer.js";
export { formatSyncReport, saveSyncReport } from "./reporter.js";
export { PROMO_URLS } from "./promo-urls.js";
export type { ExtractedPromo, PageExtraction, PromoDiff, SyncReport } from "./types.js";
