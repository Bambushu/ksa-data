import { readFileSync, writeFileSync } from "fs";
import path from "path";

const CASINOS_PATH = path.join(import.meta.dirname, "../src/casinos.ts");

export function buildFieldRegex(casinoSlug: string, field: string): RegExp {
  return new RegExp(`(["']${casinoSlug}["'][\\s\\S]*?${field}:\\s*)(\\S+?)(,|\\s)`, "m");
}

export function applyFieldUpdate(
  source: string, casinoSlug: string, field: string, newValue: unknown
): string {
  const regex = buildFieldRegex(casinoSlug, field);
  const formatted = typeof newValue === "string" ? `"${newValue}"` : String(newValue);
  return source.replace(regex, `$1${formatted}$3`);
}

export function applyAutoUpdates(
  mismatches: { casino_id: string; field: string; site_value: unknown }[]
): string[] {
  if (mismatches.length === 0) return [];
  let source = readFileSync(CASINOS_PATH, "utf-8");
  const applied: string[] = [];
  for (const m of mismatches) {
    const before = source;
    source = applyFieldUpdate(source, m.casino_id, m.field, m.site_value);
    if (source !== before) {
      applied.push(`${m.casino_id}.${m.field}: ${m.site_value}`);
    }
  }
  if (applied.length > 0) writeFileSync(CASINOS_PATH, source);
  return applied;
}
