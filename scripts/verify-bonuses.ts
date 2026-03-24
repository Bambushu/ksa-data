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

import { runBonusVerification } from "./verify-bonuses-lib.js";
import { formatBonusReport } from "@bambushu/casino-guard";

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
  const { report } = await runBonusVerification(flags);

  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("");
    console.log(formatBonusReport(report));
  }

  // Exit codes: 0 = all clear, 1 = mismatches found, 2 = errors only
  if (report.summary.mismatched > 0) process.exit(1);
  if (report.summary.errors > 0) process.exit(2);
  process.exit(0);
}

main().catch((err) => {
  console.error("BonusGuard fatal error:", err);
  process.exit(2);
});
