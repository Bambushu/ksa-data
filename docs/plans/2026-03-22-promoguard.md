# PromoGuard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a promotion discovery and sync pipeline that fetches casino promo pages, extracts active promotions via LLM, and keeps `src/promotions.ts` in sync with reality.

**Architecture:** PromoGuard reuses BonusGuard's fetcher and cache modules for page fetching + content-hash caching. New modules handle the fundamentally different workflow: extracting an *array* of promotions per page (discovery, not verification), diffing against stored data at the set level, and writing the full updated array. The casino's promo page is the source of truth — PromoGuard syncs our data to match it.

**Tech Stack:** TypeScript, Claude CLI (Opus), Node.js, Vitest, BonusGuard fetcher/cache (shared)

**Repo:** `/Users/mikes/ksa-data`

---

## File Structure

```
ksa-data/
├── lib/
│   ├── bonusguard/          # EXISTING — fetcher.ts + cache.ts reused by PromoGuard
│   └── promoguard/
│       ├── types.ts          # PromoRecord, ExtractionResult, SyncReport types
│       ├── promo-urls.ts     # Casino slug → promo page URL mapping
│       ├── extractor.ts      # LLM prompt for extracting promotion arrays
│       ├── syncer.ts         # Diff old vs new promotions, write src/promotions.ts
│       ├── reporter.ts       # Terminal + JSON report formatting
│       ├── index.ts          # Barrel re-export
│       └── __tests__/
│           ├── extractor.test.ts
│           ├── syncer.test.ts
│           └── reporter.test.ts
├── scripts/
│   └── verify-promotions.ts  # CLI orchestrator
└── .promoguard/
    ├── cache.json            # Content-hash cache (gitignored)
    └── last-report.json      # Last sync report (gitignored)
```

---

## Task 1: Create PromoGuard types

**Files:**
- Create: `lib/promoguard/types.ts`

- [ ] **Step 1: Write types.ts**

```typescript
import type { Promotion } from "../../src/types.js";

/** Raw extraction result from LLM — one promo with confidence */
export interface ExtractedPromo {
  title: string;
  type: "deposit_bonus" | "free_spins" | "cashback" | "tournament" | "other";
  description: string;
  bonus_value: number | null;
  wagering_multiplier: number | null;
  starts: string | null;
  expires: string | null;
  terms_url: string | null;
  confidence: number;
}

/** Full extraction result for one casino page */
export interface PageExtraction {
  casino_slug: string;
  promotions: ExtractedPromo[];
  extracted_at: string;
}

/** Diff between old and new promotions for one casino */
export interface PromoDiff {
  casino_slug: string;
  casino_name: string;
  added: Promotion[];
  removed: Promotion[];
  unchanged: number;
}

/** Full sync report */
export interface SyncReport {
  date: string;
  diffs: PromoDiff[];
  errors: Array<{ casino_slug: string; casino_name: string; error: string }>;
  skipped: Array<{ casino_slug: string; reason: string }>;
  summary: {
    casinos_checked: number;
    casinos_skipped: number;
    casinos_errored: number;
    promos_added: number;
    promos_removed: number;
    promos_unchanged: number;
    total_active: number;
  };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit lib/promoguard/types.ts
```

- [ ] **Step 3: Commit**

```bash
git add lib/promoguard/types.ts
git commit -m "feat(promoguard): add type definitions"
```

---

## Task 2: Create promo URL config

**Files:**
- Create: `lib/promoguard/promo-urls.ts`

- [ ] **Step 1: Write promo-urls.ts**

```typescript
/** Casino slug → promotions page URL. Only casinos with known promo pages. */
export const PROMO_URLS: Record<string, string> = {
  unibet: "https://www.unibet.nl/promotions",
  casino777: "https://www.casino777.nl/nl/promoties",
  leovegas: "https://www.leovegas.nl/promoties",
  toto: "https://www.toto.nl/acties",
  "jacks-nl": "https://www.jacks.nl/promoties",
  betnation: "https://www.betnation.nl/promoties",
  "711": "https://www.711.nl/promoties",
  kansino: "https://www.kansino.nl/promotions",
  betcity: "https://www.betcity.nl/promoties",
  "fair-play-online": "https://www.fairplayonline.nl/promoties",
  circus: "https://www.circus.nl/nl/promoties",
  "holland-casino-online": "https://www.hollandcasino.nl/online/acties",
};
```

- [ ] **Step 2: Commit**

```bash
git add lib/promoguard/promo-urls.ts
git commit -m "feat(promoguard): add promo page URL config for 12 casinos"
```

---

## Task 3: Create promo extractor (TDD)

**Files:**
- Create: `lib/promoguard/extractor.ts`
- Create: `lib/promoguard/__tests__/extractor.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect } from "vitest";
import { buildExtractionPrompt, parseExtractionResponse } from "../extractor.js";

describe("buildExtractionPrompt", () => {
  it("includes casino slug and date in prompt", () => {
    const prompt = buildExtractionPrompt("test-casino", "Some promo page text here");
    expect(prompt).toContain("test-casino");
    expect(prompt).toContain("time-limited");
    expect(prompt).not.toContain("welcome bonus");
  });
});

describe("parseExtractionResponse", () => {
  it("parses valid JSON array", () => {
    const raw = JSON.stringify([
      {
        title: "Weekend Spins",
        type: "free_spins",
        description: "50 free spins this weekend",
        bonus_value: 10,
        wagering_multiplier: 0,
        starts: "2026-03-22",
        expires: "2026-03-24",
        terms_url: null,
        confidence: 0.9,
      },
    ]);
    const result = parseExtractionResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Weekend Spins");
    expect(result[0].confidence).toBe(0.9);
  });

  it("handles markdown-wrapped JSON", () => {
    const raw = "```json\n[{\"title\":\"Test\",\"type\":\"other\",\"description\":\"d\",\"bonus_value\":null,\"wagering_multiplier\":null,\"starts\":null,\"expires\":null,\"terms_url\":null,\"confidence\":0.8}]\n```";
    const result = parseExtractionResponse(raw);
    expect(result).toHaveLength(1);
  });

  it("returns empty array for empty JSON array", () => {
    expect(parseExtractionResponse("[]")).toEqual([]);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseExtractionResponse("not json")).toThrow();
  });

  it("filters out entries with confidence below 0.5", () => {
    const raw = JSON.stringify([
      { title: "Good", type: "other", description: "d", bonus_value: null, wagering_multiplier: null, starts: null, expires: null, terms_url: null, confidence: 0.9 },
      { title: "Bad", type: "other", description: "d", bonus_value: null, wagering_multiplier: null, starts: null, expires: null, terms_url: null, confidence: 0.3 },
    ]);
    const result = parseExtractionResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Good");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/promoguard/__tests__/extractor.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write extractor.ts**

```typescript
import { execSync } from "node:child_process";
import type { ExtractedPromo } from "./types.js";

const MIN_CONFIDENCE = 0.5;

const EXTRACTION_PROMPT = `You are extracting ACTIVE PROMOTIONS (NOT the welcome bonus) from a Dutch casino promotions page.

Return ONLY a valid JSON array. Each element must have this exact structure:
{
  "title": "Promotion title",
  "type": "free_spins" | "deposit_bonus" | "cashback" | "tournament" | "other",
  "description": "1-2 sentence Dutch description of the offer",
  "bonus_value": number | null,
  "wagering_multiplier": number | null,
  "starts": "YYYY-MM-DD" | null,
  "expires": "YYYY-MM-DD" | null,
  "terms_url": "https://..." | null,
  "confidence": 0.0-1.0
}

Rules:
- SKIP the welcome bonus / welkomstbonus — only extract time-limited or recurring promotions
- SKIP VIP/loyalty programs and ongoing rewards without clear terms
- For recurring promotions (e.g., "elke maandag"), set starts to the current week's occurrence
- If no end date is stated, set expires to null
- If a promotion says "deze maand" or "maart", set expires to the last day of that month
- Set confidence based on how clearly the terms are stated
- For tournaments with prize pools, set bonus_value to the total prize pool
- For free spins offers, set bonus_value to total_spins × value_per_spin if known
- Return [] if no promotions are found (NOT the welcome bonus)
- Descriptions should be in Dutch (as found on the page)`;

export function buildExtractionPrompt(casinoSlug: string, pageText: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `${EXTRACTION_PROMPT}

Casino: ${casinoSlug}
Today's date: ${today}

Page text:
${pageText}`;
}

export function parseExtractionResponse(raw: string): ExtractedPromo[] {
  const cleaned = raw.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed)) {
    throw new Error("Expected JSON array from extraction");
  }

  return parsed.filter((p: ExtractedPromo) => p.confidence >= MIN_CONFIDENCE);
}

export async function extractPromotions(casinoSlug: string, pageText: string): Promise<ExtractedPromo[]> {
  const prompt = buildExtractionPrompt(casinoSlug, pageText);

  const output = execSync("claude -p --model opus --output-format json", {
    input: prompt,
    encoding: "utf-8",
    maxBuffer: 1024 * 1024,
    timeout: 60_000,
  });

  let text: string;
  try {
    const parsed = JSON.parse(output);
    text = parsed.result ?? parsed.content ?? parsed.text ?? output;
  } catch {
    text = output;
  }

  return parseExtractionResponse(text);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/promoguard/__tests__/extractor.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/promoguard/extractor.ts lib/promoguard/__tests__/extractor.test.ts
git commit -m "feat(promoguard): add LLM promotion extractor with tests"
```

---

## Task 4: Create promo syncer (TDD)

**Files:**
- Create: `lib/promoguard/syncer.ts`
- Create: `lib/promoguard/__tests__/syncer.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect } from "vitest";
import { diffPromotions, buildPromotionId, mergeExtractions } from "../syncer.js";
import type { Promotion } from "../../../src/types.js";
import type { ExtractedPromo } from "../types.js";

const promo = (overrides: Partial<Promotion>): Promotion => ({
  id: "test-promo",
  casino_slug: "test-casino",
  title: "Test Promo",
  type: "free_spins",
  description: "Test description",
  starts: "2026-03-20",
  expires: "2026-03-30",
  last_verified: "2026-03-22",
  ...overrides,
});

describe("buildPromotionId", () => {
  it("generates a slug from casino and title", () => {
    const id = buildPromotionId("casino777", "Weekend Special: Area Link Dragon");
    expect(id).toBe("casino777-weekend-special-area-link-dragon");
  });

  it("handles special characters", () => {
    const id = buildPromotionId("711", "€10.000 Hacksaw Gaming Toernooi");
    expect(id).toBe("711-10-000-hacksaw-gaming-toernooi");
  });
});

describe("diffPromotions", () => {
  it("detects added promotions", () => {
    const oldPromos: Promotion[] = [];
    const newPromos: Promotion[] = [promo({ id: "new-1", title: "New Promo" })];
    const diff = diffPromotions("test-casino", "Test Casino", oldPromos, newPromos);
    expect(diff.added).toHaveLength(1);
    expect(diff.removed).toHaveLength(0);
  });

  it("detects removed promotions", () => {
    const oldPromos = [promo({ id: "old-1", title: "Old Promo" })];
    const newPromos: Promotion[] = [];
    const diff = diffPromotions("test-casino", "Test Casino", oldPromos, newPromos);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(1);
  });

  it("detects unchanged promotions by id", () => {
    const p = promo({ id: "same-1" });
    const diff = diffPromotions("test-casino", "Test Casino", [p], [p]);
    expect(diff.unchanged).toBe(1);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
  });
});

describe("mergeExtractions", () => {
  it("converts extracted promos to Promotion objects", () => {
    const extracted: ExtractedPromo[] = [{
      title: "Test Promo",
      type: "free_spins",
      description: "Test",
      bonus_value: 10,
      wagering_multiplier: 0,
      starts: "2026-03-22",
      expires: "2026-03-25",
      terms_url: "https://example.com",
      confidence: 0.9,
    }];
    const result = mergeExtractions("test-casino", extracted);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("test-casino-test-promo");
    expect(result[0].casino_slug).toBe("test-casino");
    expect(result[0].last_verified).toBe(new Date().toISOString().slice(0, 10));
  });

  it("uses today as default start date when null", () => {
    const extracted: ExtractedPromo[] = [{
      title: "No Date",
      type: "other",
      description: "d",
      bonus_value: null,
      wagering_multiplier: null,
      starts: null,
      expires: null,
      terms_url: null,
      confidence: 0.8,
    }];
    const result = mergeExtractions("test-casino", extracted);
    expect(result[0].starts).toBe(new Date().toISOString().slice(0, 10));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/promoguard/__tests__/syncer.test.ts
```

- [ ] **Step 3: Write syncer.ts**

```typescript
import fs from "node:fs";
import path from "node:path";
import type { Promotion } from "../../src/types.js";
import type { ExtractedPromo, PromoDiff } from "./types.js";

/** Generate a deterministic ID from casino slug + title */
export function buildPromotionId(casinoSlug: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[€$£]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${casinoSlug}-${slug}`;
}

/** Convert extracted promos to Promotion objects */
export function mergeExtractions(casinoSlug: string, extracted: ExtractedPromo[]): Promotion[] {
  const today = new Date().toISOString().slice(0, 10);

  return extracted.map((e) => ({
    id: buildPromotionId(casinoSlug, e.title),
    casino_slug: casinoSlug,
    title: e.title,
    type: e.type,
    description: e.description,
    ...(e.bonus_value != null && { bonus_value: e.bonus_value }),
    ...(e.wagering_multiplier != null && { wagering_multiplier: e.wagering_multiplier }),
    starts: e.starts ?? today,
    expires: e.expires ?? "2099-12-31", // Ongoing promo — no known end date
    ...(e.terms_url != null && { terms_url: e.terms_url }),
    last_verified: today,
  }));
}

/** Diff old vs new promotions for a single casino */
export function diffPromotions(
  casinoSlug: string,
  casinoName: string,
  oldPromos: Promotion[],
  newPromos: Promotion[]
): PromoDiff {
  const oldIds = new Set(oldPromos.map((p) => p.id));
  const newIds = new Set(newPromos.map((p) => p.id));

  const added = newPromos.filter((p) => !oldIds.has(p.id));
  const removed = oldPromos.filter((p) => !newIds.has(p.id));
  const unchanged = newPromos.filter((p) => oldIds.has(p.id)).length;

  return { casino_slug: casinoSlug, casino_name: casinoName, added, removed, unchanged };
}

/** Write the full promotions array to src/promotions.ts */
export function writePromotions(allPromos: Promotion[]): void {
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/promoguard/__tests__/syncer.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/promoguard/syncer.ts lib/promoguard/__tests__/syncer.test.ts
git commit -m "feat(promoguard): add promotion syncer with diff logic"
```

---

## Task 5: Create promo reporter (TDD)

**Files:**
- Create: `lib/promoguard/reporter.ts`
- Create: `lib/promoguard/__tests__/reporter.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect } from "vitest";
import { formatSyncReport } from "../reporter.js";
import type { SyncReport } from "../types.js";

describe("formatSyncReport", () => {
  it("formats a report with additions and removals", () => {
    const report: SyncReport = {
      date: "2026-03-22",
      diffs: [{
        casino_slug: "casino777",
        casino_name: "Casino777",
        added: [{ id: "new-1", casino_slug: "casino777", title: "New Promo", type: "free_spins", description: "d", starts: "2026-03-22", expires: "2026-03-25", last_verified: "2026-03-22" }],
        removed: [{ id: "old-1", casino_slug: "casino777", title: "Old Promo", type: "tournament", description: "d", starts: "2026-03-01", expires: "2026-03-20", last_verified: "2026-03-20" }],
        unchanged: 3,
      }],
      errors: [],
      skipped: [],
      summary: { casinos_checked: 1, casinos_skipped: 0, casinos_errored: 0, promos_added: 1, promos_removed: 1, promos_unchanged: 3, total_active: 4 },
    };
    const output = formatSyncReport(report);
    expect(output).toContain("Casino777");
    expect(output).toContain("+ New Promo");
    expect(output).toContain("- Old Promo");
    expect(output).toContain("1 added");
    expect(output).toContain("1 removed");
  });

  it("formats empty report", () => {
    const report: SyncReport = {
      date: "2026-03-22",
      diffs: [],
      errors: [],
      skipped: [],
      summary: { casinos_checked: 0, casinos_skipped: 0, casinos_errored: 0, promos_added: 0, promos_removed: 0, promos_unchanged: 0, total_active: 0 },
    };
    const output = formatSyncReport(report);
    expect(output).toContain("PromoGuard");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/promoguard/__tests__/reporter.test.ts
```

- [ ] **Step 3: Write reporter.ts**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/promoguard/__tests__/reporter.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/promoguard/reporter.ts lib/promoguard/__tests__/reporter.test.ts
git commit -m "feat(promoguard): add sync report formatter"
```

---

## Task 6: Create barrel export + update vitest config

**Files:**
- Create: `lib/promoguard/index.ts`
- Modify: `vitest.config.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Write index.ts**

```typescript
export { extractPromotions, buildExtractionPrompt, parseExtractionResponse } from "./extractor.js";
export { buildPromotionId, mergeExtractions, diffPromotions, writePromotions } from "./syncer.js";
export { formatSyncReport, saveSyncReport } from "./reporter.js";
export { PROMO_URLS } from "./promo-urls.js";
export type { ExtractedPromo, PageExtraction, PromoDiff, SyncReport } from "./types.js";
```

- [ ] **Step 2: Add .promoguard/ to .gitignore**

Append to `.gitignore`:
```
.promoguard/
```

- [ ] **Step 3: Update vitest.config.ts**

Ensure the test include pattern covers promoguard:
```typescript
include: ["lib/**/__tests__/**/*.test.ts"],
```
(This should already match — verify it does.)

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: All bonusguard tests (11) + new promoguard tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/promoguard/index.ts .gitignore vitest.config.ts
git commit -m "feat(promoguard): add barrel export, gitignore, vitest config"
```

---

## Task 7: Create CLI orchestrator

**Files:**
- Create: `scripts/verify-promotions.ts`

- [ ] **Step 1: Write verify-promotions.ts**

```typescript
import { casinos } from "../src/casinos.js";
import { promotions as storedPromotions } from "../src/promotions.js";
import type { Promotion } from "../src/types.js";
import { PROMO_URLS } from "../lib/promoguard/promo-urls.js";
import { fetchTermsPage } from "../lib/bonusguard/fetcher.js";
import { cleanHtml } from "../lib/bonusguard/extractor.js";
import { readCache, writeCache } from "../lib/bonusguard/cache.js";
import { extractPromotions } from "../lib/promoguard/extractor.js";
import { mergeExtractions, diffPromotions, writePromotions } from "../lib/promoguard/syncer.js";
import { formatSyncReport, saveSyncReport } from "../lib/promoguard/reporter.js";
import type { PromoDiff, SyncReport } from "../lib/promoguard/types.js";

const CACHE_PATH = ".promoguard/cache.json";

// Parse CLI flags
const args = process.argv.slice(2);
const flags = {
  dryRun: args.includes("--dry-run"),
  casino: args.includes("--casino") ? args[args.indexOf("--casino") + 1] : undefined,
  noCache: args.includes("--no-cache"),
  json: args.includes("--json"),
};

async function main() {
  const cache = flags.noCache ? {} : readCache(CACHE_PATH);
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

    // Fetch
    const fetched = await fetchTermsPage(url);
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
        const pageText = cleanHtml(fetched.html);
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
  writeCache(cache, CACHE_PATH);

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

  saveSyncReport(report);

  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("");
    console.log(formatSyncReport(report));
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
```

- [ ] **Step 2: Add npm script to package.json**

Add to `"scripts"` in `package.json`:
```json
"verify:promos": "npx tsx scripts/verify-promotions.ts"
```

- [ ] **Step 3: Build dist/**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-promotions.ts package.json dist/
git commit -m "feat(promoguard): add CLI orchestrator with dry-run support"
```

---

## Task 8: Integration test — dry run

- [ ] **Step 1: Run PromoGuard in dry-run mode for a single casino**

```bash
npx tsx scripts/verify-promotions.ts --dry-run --casino casino777
```

Expected: Fetches the Casino777 promo page, extracts promotions via LLM, shows diff report, does NOT write to `src/promotions.ts`.

- [ ] **Step 2: Run PromoGuard dry-run for ALL casinos**

```bash
npx tsx scripts/verify-promotions.ts --dry-run
```

Expected: Checks all 12 casino promo pages, shows full sync report with additions/removals.

- [ ] **Step 3: If tests pass, run a real sync**

```bash
npx tsx scripts/verify-promotions.ts
```

Expected: Writes updated `src/promotions.ts` with LLM-extracted promotions.

- [ ] **Step 4: Verify the written data**

```bash
npx tsc --noEmit src/promotions.ts
npx vitest run
```

Expected: TypeScript compiles, all tests pass, Zod validation passes at import.

- [ ] **Step 5: Build dist and commit**

```bash
npm run build
git add -A
git commit -m "feat(promoguard): verified sync — promotions data refreshed"
```

- [ ] **Step 6: Push**

```bash
git push origin main
```
