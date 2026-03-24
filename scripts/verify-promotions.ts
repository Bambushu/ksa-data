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

import { runPromoVerification } from "./verify-promotions-lib.js";
import { formatPromoReport } from "@bambushu/casino-guard";

const args = process.argv.slice(2);
const flags = {
  dryRun: args.includes("--dry-run"),
  casino: args.includes("--casino") ? args[args.indexOf("--casino") + 1] : undefined,
  noCache: args.includes("--no-cache"),
  json: args.includes("--json"),
};

async function main() {
  const { report } = await runPromoVerification(flags);

  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("");
    console.log(formatPromoReport(report));
  }

  // Write confirmation (writePromotions already called inside lib)
  if (!flags.dryRun) {
    if (!flags.json) {
      console.log(`  Wrote ${report.summary.total_active} promotions to src/promotions.ts\n`);
    }
  } else if (!flags.json) {
    console.log("  --dry-run: no changes written\n");
  }
}

main().catch((err) => {
  console.error("PromoGuard error:", err);
  process.exit(2);
});
