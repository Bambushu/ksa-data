// daily-verify.ts — Main pipeline orchestrator for daily ksa-data verification.
//
// Usage:
//   npx tsx scripts/daily-verify.ts                  # full run: verify, update, build, publish
//   npx tsx scripts/daily-verify.ts --dry-run        # verify only, no writes/publish
//   npx tsx scripts/daily-verify.ts --casino unibet  # single casino
//   npx tsx scripts/daily-verify.ts --dry-run --casino unibet

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runBonusVerification } from "./verify-bonuses-lib.js";
import type { BonusVerifyResult } from "./verify-bonuses-lib.js";
import { runPromoVerification } from "./verify-promotions-lib.js";
import type { PromoVerifyResult } from "./verify-promotions-lib.js";
import { classifyMismatches } from "./auto-update-rules.js";
import type { ClassifiedMismatches } from "./auto-update-rules.js";
import { applyAutoUpdates } from "./field-updater.js";
import type { Mismatch } from "@bambushu/casino-guard";

// ── Arg parsing ─────────────────────────────────────────────────────

interface Flags {
  dryRun: boolean;
  casino?: string;
}

function parseArgs(): Flags {
  const args = process.argv.slice(2);
  const flags: Flags = { dryRun: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") {
      flags.dryRun = true;
    } else if (args[i] === "--casino" && args[i + 1]) {
      flags.casino = args[++i];
    }
  }

  return flags;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const flags = parseArgs();
  const today = new Date().toISOString().slice(0, 10);
  let newVersion: string | null = null;

  console.log(`\n[daily-verify] ${today}${flags.dryRun ? " (DRY RUN)" : ""}`);
  if (flags.casino) console.log(`  Filtering: ${flags.casino}`);

  // ── 1. Bonus verification ──────────────────────────────────────

  console.log("\n[bonuses] Running bonus verification...");
  const bonusResult: BonusVerifyResult = await runBonusVerification({
    autoUpdate: true,
    maxCacheAge: 7,
    casino: flags.casino,
    json: true,
  });

  const summary = bonusResult.report.summary;
  console.log(`[bonuses] Checked: ${summary.checked}  Confirmed: ${summary.confirmed}  Mismatched: ${summary.mismatched}  Errors: ${summary.errors}`);

  // ── 2. Promo verification ──────────────────────────────────────

  console.log("\n[promos] Running promo verification...");
  const promoResult: PromoVerifyResult = await runPromoVerification({
    dryRun: flags.dryRun,
    casino: flags.casino,
    json: true,
  });

  const promoSummary = promoResult.report.summary;
  console.log(`[promos] Checked: ${promoSummary.casinos_checked}  Added: ${promoResult.added}  Removed: ${promoResult.removed}  Unchanged: ${promoResult.unchanged}  Errors: ${promoSummary.casinos_errored}`);

  // ── 3. Classify mismatches ─────────────────────────────────────

  const allMismatches: Mismatch[] = bonusResult.report.results.flatMap(
    (r) => r.mismatches || [],
  );
  const classified: ClassifiedMismatches = classifyMismatches(allMismatches);

  console.log(
    `\n[classify] Auto-update: ${classified.autoUpdate.length}  Flagged: ${classified.flagged.length}  Skipped: ${classified.skipped.length}`,
  );

  // ── 4. Apply auto-updates ─────────────────────────────────────

  let appliedUpdates: string[] = [];
  if (!flags.dryRun && classified.autoUpdate.length > 0) {
    appliedUpdates = applyAutoUpdates(classified.autoUpdate);
    for (const u of appliedUpdates) {
      console.log(`  [AUTO] ${u}`);
    }
  }

  // ── 5. Early exit: nothing changed ────────────────────────────

  const hasDataChanges =
    appliedUpdates.length > 0 ||
    promoResult.added > 0 ||
    promoResult.removed > 0 ||
    bonusResult.updatedCasinos.length > 0;

  if (!hasDataChanges) {
    console.log("\n[daily-verify] No changes detected.");
    writeResults(today, flags, summary, promoResult, appliedUpdates, classified, newVersion);
    return;
  }

  // ── 6. Dry-run exit ───────────────────────────────────────────

  if (flags.dryRun) {
    console.log("\n[daily-verify] Dry run — skipping build/commit/publish.");
    if (appliedUpdates.length > 0) {
      console.log(`  Would auto-update ${appliedUpdates.length} field(s)`);
    }
    if (promoResult.added > 0 || promoResult.removed > 0) {
      console.log(`  Would sync promos: +${promoResult.added} / -${promoResult.removed}`);
    }
    writeResults(today, flags, summary, promoResult, appliedUpdates, classified, newVersion);
    return;
  }

  // ── 7. Build, commit, push, publish ───────────────────────────

  fs.mkdirSync("results", { recursive: true });

  console.log("\n[build] Building...");
  execSync("npm run build", { stdio: "inherit" });

  // Git commit data changes
  const commitMsg = `data: daily verification ${today} (${summary.confirmed} confirmed, ${appliedUpdates.length} updated, ${classified.flagged.length} flagged)`;
  execSync("git add src/ dist/", { stdio: "inherit" });
  try {
    execSync(`git commit -m "${commitMsg}"`, { stdio: "inherit" });
  } catch {
    console.log("  No data changes to commit");
  }

  // Version bump
  execSync("npm version patch --no-git-tag-version", { stdio: "pipe" });
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf-8"));
  newVersion = pkg.version;
  execSync("git add package.json package-lock.json", { stdio: "inherit" });
  execSync(`git commit -m "chore: bump to ${newVersion}"`, {
    stdio: "inherit",
  });

  // Push
  console.log("[push] Pushing...");
  execSync("git push origin main", { stdio: "inherit" });

  // Publish
  console.log("[publish] Publishing...");
  execSync("npm publish --registry=https://npm.pkg.github.com", {
    stdio: "inherit",
  });
  console.log(`  Published @bambushu/ksa-data@${newVersion}`);

  // Update bonuswijs
  console.log("[bonuswijs] Updating dependency...");
  execSync("npm install @bambushu/ksa-data@latest", {
    cwd: "/Users/mikes/bonuswijs",
    stdio: "inherit",
  });
  execSync(
    'git add package.json package-lock.json && git commit -m "chore: update @bambushu/ksa-data" && git push origin main',
    { cwd: "/Users/mikes/bonuswijs", stdio: "inherit" },
  );
  console.log("  BonusWijs updated and pushed (Vercel deploy triggered)");

  // ── 8. Create GitHub issue for flagged items ──────────────────

  if (classified.flagged.length > 0) {
    createFlaggedIssue(classified.flagged, today);
  }

  // ── 9. Write results ──────────────────────────────────────────

  writeResults(today, flags, summary, promoResult, appliedUpdates, classified, newVersion);

  console.log(`\n[daily-verify] Done. Version ${newVersion} published.`);
}

// ── Helpers ─────────────────────────────────────────────────────────

function writeResults(
  today: string,
  flags: Flags,
  summary: { checked: number; confirmed: number; mismatched: number; errors: number },
  promoResult: PromoVerifyResult,
  appliedUpdates: string[],
  classified: ClassifiedMismatches,
  newVersion: string | null,
) {
  fs.mkdirSync("results", { recursive: true });

  const results = {
    date: today,
    dry_run: flags.dryRun,
    bonuses: {
      checked: summary.checked,
      confirmed: summary.confirmed,
      mismatched: summary.mismatched,
      auto_updated: appliedUpdates.length,
      flagged: classified.flagged.length,
      errors: summary.errors,
    },
    promos: {
      checked: promoResult.report.summary.casinos_checked,
      added: promoResult.added,
      removed: promoResult.removed,
      unchanged: promoResult.unchanged,
      errors: promoResult.report.summary.casinos_errored,
    },
    published_version: newVersion,
    bonuswijs_deployed: !flags.dryRun && newVersion !== null,
    flagged_details: classified.flagged,
    auto_updated_details: appliedUpdates,
  };

  fs.writeFileSync(
    `results/${today}.json`,
    JSON.stringify(results, null, 2),
  );
  console.log(`[results] Written to results/${today}.json`);
}

function createFlaggedIssue(flagged: Mismatch[], today: string) {
  const lines = flagged.map(
    (m) =>
      `- **${m.casino_name}** (${m.casino_id}): \`${m.field}\` — ours: \`${m.our_value}\`, site: \`${m.site_value}\` (confidence: ${m.confidence})`,
  );

  const title = `Review: ${flagged.length} mismatch(es) flagged ${today}`;
  const bodyFile = path.join(os.tmpdir(), `ksa-data-flagged-${today}.md`);
  fs.writeFileSync(bodyFile, lines.join("\n"));

  try {
    execSync(
      `gh issue create --repo Bambushu/ksa-data --title "${title}" --body-file "${bodyFile}"`,
      { stdio: "inherit" },
    );
  } catch (err) {
    console.error("  Failed to create GitHub issue:", err);
  } finally {
    try { fs.unlinkSync(bodyFile); } catch { /* ignore */ }
  }
}

// ── Run ─────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error("\n[FATAL] daily-verify crashed:", err);

  // Attempt to create an alert issue
  const today = new Date().toISOString().slice(0, 10);
  const stack = err instanceof Error ? err.stack ?? err.message : String(err);
  const alertFile = path.join(os.tmpdir(), `ksa-data-alert-${today}.md`);

  try {
    fs.writeFileSync(alertFile, `Pipeline crashed at ${new Date().toISOString()}:\n\n\`\`\`\n${stack}\n\`\`\``);
    execSync(
      `gh issue create --repo Bambushu/ksa-data --title "[ALERT] daily-verify crashed ${today}" --body-file "${alertFile}"`,
      { stdio: "inherit" },
    );
  } catch {
    console.error("  Could not create alert issue.");
  } finally {
    try { fs.unlinkSync(alertFile); } catch { /* ignore */ }
  }

  process.exit(2);
});
