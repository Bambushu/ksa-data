/** Fields we extract from a casino's terms page and compare against our data. */
export interface BonusRecord {
  casino_id: string;
  casino_name: string;
  terms_url: string;
  bonus_available: boolean;
  match_percentage: number | null;
  max_bonus_eur: number | null;
  wagering_requirement: number | null;
  wagering_applies_to: "bonus" | "bonus_plus_deposit" | "winnings" | null;
  bonus_type: string | null;
  free_spins: number | null;
  min_deposit_eur: number | null;
  time_limit_days: number | null;
  max_cashout_eur: number | null;
}

/** LLM extraction result — each field has a value and confidence score. */
export interface ExtractionResult {
  bonus_available: { value: boolean; confidence: number };
  match_percentage: { value: number | null; confidence: number };
  max_bonus_eur: { value: number | null; confidence: number };
  wagering_requirement: { value: number | null; confidence: number };
  wagering_applies_to: { value: string | null; confidence: number };
  bonus_type: { value: string | null; confidence: number };
  free_spins: { value: number | null; confidence: number };
  min_deposit_eur: { value: number | null; confidence: number };
  time_limit_days: { value: number | null; confidence: number };
  max_cashout_eur: { value: number | null; confidence: number };
}

export type Priority = "critical" | "high" | "medium" | "low";

export interface Mismatch {
  casino_id: string;
  casino_name: string;
  terms_url: string;
  field: string;
  our_value: unknown;
  site_value: unknown;
  priority: Priority;
  confidence: number;
}

export interface CasinoResult {
  casino_id: string;
  casino_name: string;
  status: "confirmed" | "mismatch" | "skipped" | "error";
  mismatches: Mismatch[];
  reason?: string;
}

export interface VerificationReport {
  date: string;
  results: CasinoResult[];
  summary: {
    checked: number;
    confirmed: number;
    mismatched: number;
    skipped: number;
    errors: number;
  };
}

export interface CacheEntry {
  content_hash: string;
  extracted_at: string;
  extraction: ExtractionResult;
}

export interface CacheStore {
  [casino_id: string]: CacheEntry;
}
