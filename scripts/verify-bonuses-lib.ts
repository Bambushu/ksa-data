import { casinos } from "../src/casinos.js";
import {
  fetchTermsPage,
  cleanHtml,
  readCache,
  writeCache,
  getCacheEntry,
  setCacheEntry,
  extractBonusData,
  compareBonusData,
  saveBonusReport,
} from "@bambushu/casino-guard";
import type { BonusRecord, ExtractionResult, VerificationReport } from "@bambushu/casino-guard";
import fs from "node:fs";
import path from "node:path";

// ── Interfaces ──────────────────────────────────────────────────────

export interface BonusVerifyOptions {
  casino?: string;
  noCache?: boolean;
  maxCacheAge?: number; // default 7
  autoUpdate?: boolean;
  json?: boolean;       // suppress console output
}

export interface BonusVerifyResult {
  report: VerificationReport;
  updatedCasinos: string[];
}

interface LoadResult {
  records: BonusRecord[];
  skipped: Array<{ casino_id: string; casino_name: string; reason: string }>;
}

// ── ksa-data-specific: load casino data ─────────────────────────────

function loadCasinoData(filterCasinoId?: string): LoadResult {
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

// ── ksa-data-specific: bump last_verified in src/casinos.ts ─────────

function bumpLastVerified(confirmedIds: string[], today: string): number {
  const filePath = path.join(process.cwd(), "src", "casinos.ts");
  let content = fs.readFileSync(filePath, "utf-8");
  let count = 0;

  for (const id of confirmedIds) {
    const idPattern = new RegExp(
      `(id:\\s*"${id}"[\\s\\S]*?\\n  last_verified:\\s*")\\d{4}-\\d{2}-\\d{2}(")`
    );
    const match = content.match(idPattern);
    if (match) {
      content = content.replace(idPattern, `$1${today}$2`);
      count++;
    }
  }

  if (count > 0) {
    fs.writeFileSync(filePath, content);
  }
  return count;
}

// ── Core verification logic ─────────────────────────────────────────

export async function runBonusVerification(options: BonusVerifyOptions = {}): Promise<BonusVerifyResult> {
  const maxCacheAge = options.maxCacheAge ?? 7;
  const quiet = options.json ?? false;

  // Stage 1: LOAD
  const { records, skipped } = loadCasinoData(options.casino);
  if (!quiet) {
    console.log(`\nBonusGuard: ${records.length} casinos to check, ${skipped.length} skipped\n`);
    for (const s of skipped) {
      console.log(`  ○ ${s.casino_name}: ${s.reason}`);
    }
    if (skipped.length > 0) console.log("");
  }

  const cache = options.noCache ? {} : readCache();
  const results = [];

  for (const record of records) {
    if (!quiet) process.stdout.write(`  Checking ${record.casino_name}...`);

    // Stage 2: FETCH
    const fetched = await fetchTermsPage(record.terms_url);
    if (!fetched.ok) {
      if (!quiet) console.log(` ✕ ${fetched.error}`);
      results.push({
        casino_id: record.casino_id,
        casino_name: record.casino_name,
        status: "error" as const,
        mismatches: [],
        reason: fetched.error,
      });
      continue;
    }

    // Stage 3: EXTRACT (with cache)
    let extraction: ExtractionResult;
    const cached = getCacheEntry(cache, record.casino_id, fetched.contentHash, maxCacheAge);
    if (cached) {
      extraction = cached.extraction;
      if (!quiet) process.stdout.write(" (cached)");
    } else {
      try {
        const pageText = cleanHtml(fetched.html);
        extraction = await extractBonusData(pageText);
        setCacheEntry(cache, record.casino_id, {
          content_hash: fetched.contentHash,
          extracted_at: new Date().toISOString(),
          extraction,
        });
      } catch (err) {
        if (!quiet) console.log(` ✕ extraction failed: ${err}`);
        results.push({
          casino_id: record.casino_id,
          casino_name: record.casino_name,
          status: "error" as const,
          mismatches: [],
          reason: `extraction failed: ${err}`,
        });
        continue;
      }
    }

    // Stage 4: COMPARE
    const mismatches = compareBonusData(record, extraction);
    const status = mismatches.filter((m) => m.priority !== "low").length > 0 ? "mismatch" as const : "confirmed" as const;

    if (!quiet) {
      console.log(status === "confirmed" ? " ✓" : ` ⚠ ${mismatches.length} issue(s)`);
    }

    results.push({
      casino_id: record.casino_id,
      casino_name: record.casino_name,
      status,
      mismatches,
    });
  }

  // Save cache
  writeCache(cache);

  // Stage 5: REPORT
  const today = new Date().toISOString().slice(0, 10);
  const confirmed = results.filter((r) => r.status === "confirmed");
  const mismatched = results.filter((r) => r.status === "mismatch");
  const errors = results.filter((r) => r.status === "error");

  const report: VerificationReport = {
    date: today,
    results: [
      ...results,
      ...skipped.map((s) => ({
        casino_id: s.casino_id,
        casino_name: s.casino_name,
        status: "skipped" as const,
        mismatches: [] as any[],
        reason: s.reason,
      })),
    ],
    summary: {
      checked: records.length,
      confirmed: confirmed.length,
      mismatched: mismatched.length,
      skipped: skipped.length,
      errors: errors.length,
    },
  };

  saveBonusReport(report);

  // Auto-update dates
  const updatedCasinos: string[] = [];
  if (options.autoUpdate && confirmed.length > 0) {
    const ids = confirmed.map((r) => r.casino_id);
    const bumped = bumpLastVerified(ids, today);
    if (!quiet) {
      console.log(`\n  Updated last_verified to ${today} for ${bumped} casino(s)\n`);
    }
    updatedCasinos.push(...ids);
  }

  return { report, updatedCasinos };
}
