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

import { loadCasinoData } from "../lib/bonusguard/loader.ts";
import { fetchTermsPage } from "../lib/bonusguard/fetcher.ts";
import { cleanHtml, extractBonusData } from "../lib/bonusguard/extractor.ts";
import { compareBonusData } from "../lib/bonusguard/comparator.ts";
import { readCache, writeCache, getCacheEntry, setCacheEntry } from "../lib/bonusguard/cache.ts";
import { formatReport, saveReport, bumpLastVerified } from "../lib/bonusguard/reporter.ts";

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
    let extraction;
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

  const report = {
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

  saveReport(report);

  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("");
    console.log(formatReport(report));
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
