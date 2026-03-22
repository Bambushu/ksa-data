import fs from "node:fs";
import path from "node:path";
import type { SyncReport } from "./types.js";

export function formatSyncReport(report: SyncReport): string {
  const lines: string[] = [];
  const { summary } = report;

  lines.push("══════════════════════════════════════════════════════");
  lines.push("  PromoGuard Sync Report");
  lines.push(`  ${report.date}  |  ${summary.casinos_checked} checked  |  ${summary.promos_added} added  |  ${summary.promos_removed} removed`);
  lines.push("══════════════════════════════════════════════════════");
  lines.push("");

  for (const diff of report.diffs) {
    if (diff.added.length === 0 && diff.removed.length === 0) continue;

    lines.push(`${diff.casino_name}:`);
    for (const p of diff.added) {
      lines.push(`  + ${p.title} [${p.type}] (${p.starts} → ${p.expires})`);
    }
    for (const p of diff.removed) {
      lines.push(`  - ${p.title} [${p.type}]`);
    }
    if (diff.unchanged > 0) {
      lines.push(`  = ${diff.unchanged} unchanged`);
    }
    lines.push("");
  }

  for (const e of report.errors) {
    lines.push(`[ERROR] ${e.casino_name}: ${e.error}`);
  }
  if (report.errors.length > 0) lines.push("");

  for (const s of report.skipped) {
    lines.push(`  ○ ${s.casino_slug}: ${s.reason}`);
  }
  if (report.skipped.length > 0) lines.push("");

  lines.push("──────────────────────────────────────────────────────");
  lines.push(`  ${summary.total_active} active promotions across ${summary.casinos_checked} casinos`);
  lines.push(`  ${summary.promos_added} added  |  ${summary.promos_removed} removed  |  ${summary.promos_unchanged} unchanged`);
  lines.push("══════════════════════════════════════════════════════");

  return lines.join("\n") + "\n";
}

export function saveSyncReport(report: SyncReport): void {
  const dir = path.join(process.cwd(), ".promoguard");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "last-report.json"), JSON.stringify(report, null, 2));
}
