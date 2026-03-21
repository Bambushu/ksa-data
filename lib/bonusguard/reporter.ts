import fs from "node:fs";
import path from "node:path";
import type { VerificationReport } from "./types.js";

const PRIORITY_ORDER = ["critical", "high", "medium", "low"] as const;

export function formatReport(report: VerificationReport): string {
  const lines: string[] = [];
  const { summary } = report;

  lines.push("══════════════════════════════════════════════════════");
  lines.push("  BonusGuard Verification Report");
  lines.push(`  ${report.date}  |  ${summary.checked} checked  |  ${summary.mismatched} mismatches  |  ${summary.skipped} skipped`);
  lines.push("══════════════════════════════════════════════════════");
  lines.push("");

  const mismatched = report.results.filter((r) => r.status === "mismatch");
  for (const prio of PRIORITY_ORDER) {
    for (const result of mismatched) {
      const fieldMismatches = result.mismatches.filter((m) => m.priority === prio);
      if (fieldMismatches.length === 0) continue;
      lines.push(`[${prio.toUpperCase()}] ${result.casino_name}`);
      for (const m of fieldMismatches) {
        lines.push(`  ${m.field}: ours=${m.our_value}  site=${m.site_value}  (confidence: ${m.confidence})`);
      }
      lines.push(`  source: ${result.mismatches[0].terms_url}`);
      lines.push("");
    }
  }

  const errors = report.results.filter((r) => r.status === "error");
  for (const e of errors) {
    lines.push(`[ERROR] ${e.casino_name}: ${e.reason}`);
  }
  if (errors.length > 0) lines.push("");

  lines.push("──────────────────────────────────────────────────────");
  lines.push(`  ✓ ${summary.confirmed} casinos confirmed — last_verified bumped`);
  lines.push(`  ⚠ ${summary.mismatched} casinos need manual review`);
  lines.push(`  ✕ ${summary.errors} casinos unreachable`);
  lines.push(`  ○ ${summary.skipped} casinos skipped (no terms_url)`);
  lines.push("══════════════════════════════════════════════════════");

  return lines.join("\n") + "\n";
}

export function saveReport(report: VerificationReport): void {
  const dir = path.join(process.cwd(), ".bonusguard");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "last-report.json"), JSON.stringify(report, null, 2));
}

export function bumpLastVerified(confirmedIds: string[], today: string): number {
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
