import type { Promotion } from "../../src/types.js";

/** Raw extraction result from LLM — one promo with confidence */
export interface ExtractedPromo {
  title: string;
  type: "deposit_bonus" | "free_spins" | "cashback" | "tournament" | "other";
  description: string;
  bonus_value: number | null;
  wagering_multiplier: number | null;
  starts: string | null;
  expires: string | null;
  terms_url: string | null;
  confidence: number;
}

/** Full extraction result for one casino page */
export interface PageExtraction {
  casino_slug: string;
  promotions: ExtractedPromo[];
  extracted_at: string;
}

/** Diff between old and new promotions for one casino */
export interface PromoDiff {
  casino_slug: string;
  casino_name: string;
  added: Promotion[];
  removed: Promotion[];
  unchanged: number;
}

/** Full sync report */
export interface SyncReport {
  date: string;
  diffs: PromoDiff[];
  errors: Array<{ casino_slug: string; casino_name: string; error: string }>;
  skipped: Array<{ casino_slug: string; reason: string }>;
  summary: {
    casinos_checked: number;
    casinos_skipped: number;
    casinos_errored: number;
    promos_added: number;
    promos_removed: number;
    promos_unchanged: number;
    total_active: number;
  };
}
