/**
 * BonusGuard — Automated bonus verification tool.
 * Run with: npx tsx scripts/verify-bonuses.ts
 *
 * Usage:
 *   npx tsx scripts/verify-bonuses.ts [options]
 *
 * Options:
 *   --auto-update       Bump last_verified for confirmed casinos
 *   --casino <id>       Check a single casino
 *   --no-cache          Ignore cache, re-extract everything
 *   --max-cache-age <n> Force re-extract if cache older than n days (default: 30)
 *   --json              Output JSON report instead of terminal text
 */

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
  formatBonusReport,
  saveBonusReport,
} from "@bambushu/casino-guard";
import type { BonusRecord, ExtractionResult, VerificationReport } from "@bambushu/casino-guard";
import fs from "node:fs";
import path from "node:path";

// ── ksa-data-specific: load casino data ─────────────────────────────

interface LoadResult {
  records: BonusRecord[];
  skipped: Array<{ casino_id: string; casino_name: string; reason: string }>;
}

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

// ── CLI ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = {
  autoUpdate: args.includes("--auto-update"),
  noCache: args.includes("--no-cache"),
  json: args.includes("--json"),
  casino: args.includes("--casino") ? args[args.indexOf("--casino") + 1] : undefined,
  maxCacheAge: args.includes("--max-cache-age")
    ? parseInt(args[args.indexOf("--max-cache-age") + 1], 10)
    : 30,
};

async function main() {
  // Stage 1: LOAD
  const { records, skipped } = loadCasinoData(flags.casino);
  if (!flags.json) {
    console.log(`\nBonusGuard: ${records.length} casinos to check, ${skipped.length} skipped\n`);
    for (const s of skipped) {
      console.log(`  ○ ${s.casino_name}: ${s.reason}`);
    }
    if (skipped.length > 0) console.log("");
  }

  const cache = flags.noCache ? {} : readCache();
  const results = [];

  for (const record of records) {
    if (!flags.json) process.stdout.write(`  Checking ${record.casino_name}...`);

    // Stage 2: FETCH
    const fetched = await fetchTermsPage(record.terms_url);
    if (!fetched.ok) {
      if (!flags.json) console.log(` ✕ ${fetched.error}`);
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
    const cached = getCacheEntry(cache, record.casino_id, fetched.contentHash, flags.maxCacheAge);
    if (cached) {
      extraction = cached.extraction;
      if (!flags.json) process.stdout.write(" (cached)");
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
        if (!flags.json) console.log(` ✕ extraction failed: ${err}`);
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

    if (!flags.json) {
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

  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("");
    console.log(formatBonusReport(report));
  }

  // Auto-update dates
  if (flags.autoUpdate && confirmed.length > 0) {
    const ids = confirmed.map((r) => r.casino_id);
    const bumped = bumpLastVerified(ids, today);
    if (!flags.json) {
      console.log(`\n  Updated last_verified to ${today} for ${bumped} casino(s)\n`);
    }
  }

  // Exit codes: 0 = all clear, 1 = mismatches found, 2 = errors only
  if (mismatched.length > 0) process.exit(1);
  if (errors.length > 0) process.exit(2);
  process.exit(0);
}

main().catch((err) => {
  console.error("BonusGuard fatal error:", err);
  process.exit(2);
});
