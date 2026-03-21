import { casinos } from "../../src/casinos.js";
import type { BonusRecord } from "./types.js";

export interface LoadResult {
  records: BonusRecord[];
  skipped: Array<{ casino_id: string; casino_name: string; reason: string }>;
}

export function loadCasinoData(filterCasinoId?: string): LoadResult {
  const records: BonusRecord[] = [];
  const skipped: LoadResult["skipped"] = [];

  for (const c of casinos) {
    if (filterCasinoId && c.id !== filterCasinoId) continue;

    if (c.welcome_bonus_available === false) {
      skipped.push({ casino_id: c.id, casino_name: c.name, reason: "welcome_bonus_available is false" });
      continue;
    }
    if (!c.terms_url) {
      skipped.push({ casino_id: c.id, casino_name: c.name, reason: "no terms_url" });
      continue;
    }

    records.push({
      casino_id: c.id,
      casino_name: c.name,
      terms_url: c.terms_url,
      bonus_available: true,
      match_percentage: c.welcome_bonus?.match_percentage ?? null,
      max_bonus_eur: c.welcome_bonus?.max_bonus_eur ?? null,
      wagering_requirement: c.welcome_bonus?.wagering_requirement ?? null,
      wagering_applies_to: c.welcome_bonus?.wagering_applies_to ?? null,
      bonus_type: c.welcome_bonus?.type ?? null,
      free_spins: c.welcome_bonus?.free_spins ?? null,
      min_deposit_eur: c.welcome_bonus?.min_deposit_eur ?? null,
      time_limit_days: c.welcome_bonus?.time_limit_days ?? null,
      max_cashout_eur: c.welcome_bonus?.max_cashout_eur ?? null,
    });
  }

  return { records, skipped };
}
