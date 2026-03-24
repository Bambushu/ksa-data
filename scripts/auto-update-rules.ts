import type { Mismatch } from "@bambushu/casino-guard";

export interface ClassifiedMismatches {
  autoUpdate: Mismatch[];
  flagged: Mismatch[];
  skipped: Mismatch[];
}

const AUTO_UPDATE_THRESHOLD = 0.9;
const FLAG_THRESHOLD = 0.7;
const NEVER_AUTO_UPDATE_FIELDS = new Set(["bonus_available"]);

export function classifyMismatches(mismatches: Mismatch[]): ClassifiedMismatches {
  const autoUpdate: Mismatch[] = [];
  const flagged: Mismatch[] = [];
  const skipped: Mismatch[] = [];

  for (const m of mismatches) {
    if (m.confidence < FLAG_THRESHOLD) {
      skipped.push(m);
    } else if (m.confidence < AUTO_UPDATE_THRESHOLD) {
      flagged.push(m);
    } else if (NEVER_AUTO_UPDATE_FIELDS.has(m.field)) {
      flagged.push(m);
    } else if (m.site_value === null || m.site_value === undefined) {
      // Never auto-write null — flag for manual review
      flagged.push(m);
    } else {
      autoUpdate.push(m);
    }
  }

  return { autoUpdate, flagged, skipped };
}
