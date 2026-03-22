/**
 * PromoGuard — Automated promotions sync tool.
 * Run with: npx tsx scripts/verify-promotions.ts
 *
 * Usage:
 *   npx tsx scripts/verify-promotions.ts [options]
 *
 * Options:
 *   --dry-run           Don't write changes to src/promotions.ts
 *   --casino <slug>     Check a single casino
 *   --no-cache          Ignore cache, re-extract everything
 *   --json              Output JSON report instead of terminal text
 */

import { casinos } from "../src/casinos.js";
import { promotions as storedPromotions } from "../src/promotions.js";
import type { Promotion } from "../src/types.js";
import {
  fetchTermsPage,
  cleanPromoHtml,
  readCache,
  writeCache,
  extractPromotions,
  mergeExtractions,
  diffPromotions,
  formatPromoReport,
  savePromoReport,
} from "@bambushu/casino-guard";
import type { PromoDiff, SyncReport } from "@bambushu/casino-guard";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// ── ksa-data-specific: Dutch market promo URLs ──────────────────────

const PROMO_URLS: Record<string, string> = {
  unibet: "https://www.unibet.nl/promotions",
  casino777: "https://www.casino777.nl/nl/promoties",
  leovegas: "https://www.leovegas.nl/promoties",
  toto: "https://www.toto.nl/acties",
  "jacks-nl": "https://www.jacks.nl/promoties",
  betnation: "https://www.betnation.nl/promoties",
  "711": "https://www.711.nl/promoties",
  kansino: "https://www.kansino.nl/promotions",
  betcity: "https://www.betcity.nl/promoties",
  "fair-play-online": "https://fairplaycasino.nl/promoties",
  circus: "https://www.circus.nl/nl/promoties",
  // "holland-casino-online" — promoties page only shows "MEER INFO" buttons, no promo details. Needs multi-page scraping.
};

// ── ksa-data-specific: SPA browser fallback ─────────────────────────

function fetchWithBrowser(url: string): { ok: boolean; html: string; contentHash: string; error?: string } {
  try {
    execSync(`openclaw browser open "${url}"`, { timeout: 15_000, stdio: "pipe" });
    execSync(`openclaw browser wait --timeout 5000 --load networkidle`, { timeout: 10_000, stdio: "pipe" }).toString();
  } catch { /* wait may fail, page might still have loaded */ }
  try {
    const text = execSync(
      `openclaw browser evaluate --fn "(function() { return document.body.innerText; })"`,
      { timeout: 10_000, encoding: "utf-8" }
    );
    if (!text || text.trim().length < 500) {
      return { ok: false, html: "", contentHash: "", error: "Browser: page content too short" };
    }
    const contentHash = createHash("sha256").update(text).digest("hex");
    return { ok: true, html: text, contentHash };
  } catch (err) {
    return { ok: false, html: "", contentHash: "", error: `Browser failed: ${err}` };
  }
}

// ── ksa-data-specific: write promotions to src/promotions.ts ────────

function writePromotions(allPromos: Promotion[]): void {
  // Sort by casino, then by expiry
  allPromos.sort((a, b) => {
    if (a.casino_slug !== b.casino_slug) return a.casino_slug.localeCompare(b.casino_slug);
    return a.expires.localeCompare(b.expires);
  });

  const lines = [
    'import type { Promotion } from "./types.js";',
    'import { promotionsArraySchema } from "./schemas.js";',
    "",
    "export const promotions: Promotion[] = " + JSON.stringify(allPromos, null, 2) + ";",
    "",
    "promotionsArraySchema.parse(promotions);",
    "",
  ];

  const filePath = path.join(process.cwd(), "src", "promotions.ts");
  fs.writeFileSync(filePath, lines.join("\n"));
}

// ── CLI ─────────────────────────────────────────────────────────────

const CACHE_PATH = ".promoguard/cache.json";

const args = process.argv.slice(2);
const flags = {
  dryRun: args.includes("--dry-run"),
  casino: args.includes("--casino") ? args[args.indexOf("--casino") + 1] : undefined,
  noCache: args.includes("--no-cache"),
  json: args.includes("--json"),
};

async function main() {
  const cache: Record<string, any> = flags.noCache ? {} : readCache(CACHE_PATH) as any;
  const diffs: PromoDiff[] = [];
  const errors: Array<{ casino_slug: string; casino_name: string; error: string }> = [];
  const skipped: Array<{ casino_slug: string; reason: string }> = [];

  // All promotions that survive this run
  const allNewPromos: Promotion[] = [];

  // Promotions from casinos NOT being checked (preserve them)
  const checkedSlugs = new Set<string>();

  const entries = Object.entries(PROMO_URLS);

  for (const [slug, url] of entries) {
    if (flags.casino && slug !== flags.casino) continue;
    checkedSlugs.add(slug);

    const casino = casinos.find((c) => c.slug === slug);
    const name = casino?.name ?? slug;

    if (!flags.json) process.stdout.write(`  Checking ${name}...`);

    // Fetch — try regular fetch first, use browser if cleaned content too thin
    let fetched = await fetchTermsPage(url);
    if (fetched.ok) {
      const cleaned = cleanPromoHtml(fetched.html);
      if (cleaned.length < 2000) {
        // Page is likely JS-rendered (SPA shell) — use browser to render
        if (!flags.json) process.stdout.write(" (SPA detected, using browser)");
        const browserResult = fetchWithBrowser(url);
        if (browserResult.ok) {
          fetched = { ...fetched, html: browserResult.html, contentHash: browserResult.contentHash };
        }
      }
    }
    if (!fetched.ok) {
      if (!flags.json) console.log(` ✕ ${fetched.error}`);
      errors.push({ casino_slug: slug, casino_name: name, error: fetched.error ?? "fetch failed" });
      // Preserve existing promos for this casino on fetch failure
      allNewPromos.push(...storedPromotions.filter((p) => p.casino_slug === slug));
      continue;
    }

    // Extract (with cache — using simple key/hash/data pattern)
    let extracted;
    const cacheKey = `promo:${slug}`;
    const cached = cache[cacheKey];
    if (cached && cached.content_hash === fetched.contentHash) {
      extracted = cached.extraction;
      if (!flags.json) process.stdout.write(" (cached)");
    } else {
      try {
        const pageText = cleanPromoHtml(fetched.html);
        extracted = await extractPromotions(slug, pageText);
        cache[cacheKey] = {
          content_hash: fetched.contentHash,
          extracted_at: new Date().toISOString(),
          extraction: extracted,
        };
      } catch (err) {
        if (!flags.json) console.log(` ✕ extraction failed: ${err}`);
        errors.push({ casino_slug: slug, casino_name: name, error: `extraction failed: ${err}` });
        allNewPromos.push(...storedPromotions.filter((p) => p.casino_slug === slug));
        continue;
      }
    }

    // Convert to Promotion objects
    const newPromos = mergeExtractions(slug, extracted);

    // Diff against stored
    const oldPromos = storedPromotions.filter((p) => p.casino_slug === slug);
    const diff = diffPromotions(slug, name, oldPromos, newPromos);
    diffs.push(diff);

    allNewPromos.push(...newPromos);

    if (!flags.json) {
      if (diff.added.length > 0 || diff.removed.length > 0) {
        console.log(` +${diff.added.length} -${diff.removed.length} =${diff.unchanged}`);
      } else {
        console.log(` ✓ ${diff.unchanged} unchanged`);
      }
    }
  }

  // Preserve promotions from casinos we didn't check
  for (const p of storedPromotions) {
    if (!checkedSlugs.has(p.casino_slug)) {
      allNewPromos.push(p);
    }
  }

  // Save cache
  writeCache(cache as any, CACHE_PATH);

  // Build report
  const report: SyncReport = {
    date: new Date().toISOString().slice(0, 10),
    diffs,
    errors,
    skipped,
    summary: {
      casinos_checked: checkedSlugs.size,
      casinos_skipped: skipped.length,
      casinos_errored: errors.length,
      promos_added: diffs.reduce((sum, d) => sum + d.added.length, 0),
      promos_removed: diffs.reduce((sum, d) => sum + d.removed.length, 0),
      promos_unchanged: diffs.reduce((sum, d) => sum + d.unchanged, 0),
      total_active: allNewPromos.length,
    },
  };

  savePromoReport(report);

  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("");
    console.log(formatPromoReport(report));
  }

  // Write promotions unless dry-run
  if (!flags.dryRun) {
    writePromotions(allNewPromos);
    if (!flags.json) {
      console.log(`  Wrote ${allNewPromos.length} promotions to src/promotions.ts\n`);
    }
  } else if (!flags.json) {
    console.log("  --dry-run: no changes written\n");
  }
}

main().catch((err) => {
  console.error("PromoGuard error:", err);
  process.exit(2);
});
