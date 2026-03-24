# Daily Verification Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a daily local pipeline that verifies casino bonus data against official websites, auto-updates ksa-data, publishes to GitHub Packages, and triggers BonusWijs redeploy.

**Architecture:** A launchd job runs a shell wrapper at 12:00 daily. The wrapper sources credentials and acquires a lock, then runs a TypeScript orchestrator. The orchestrator imports refactored verification libraries (not subprocesses), applies confidence-based auto-update rules, and executes a safe publish sequence (commit → push → publish).

**Tech Stack:** TypeScript (tsx), casino-guard (LLM extraction), GitHub Packages (npm), launchd (macOS scheduler), gh CLI (GitHub Issues)

**Spec:** `docs/superpowers/specs/2026-03-24-daily-verification-pipeline-design.md`

---

### Task 1: Refactor verify-bonuses.ts into lib + CLI wrapper

Extract the core verification logic into an importable library function. The existing CLI behavior must not change.

**Files:**
- Create: `scripts/verify-bonuses-lib.ts`
- Modify: `scripts/verify-bonuses.ts`

- [ ] **Step 1: Create verify-bonuses-lib.ts with exported types**

Create the lib file with the options interface and the core function signature. Move lines 1-98 (imports, helpers, `loadCasinoData`, `bumpLastVerified`) and the main loop (lines 113-225) into the lib. The function should return a `VerificationReport` instead of calling `process.exit()`.

```typescript
// scripts/verify-bonuses-lib.ts
// Export interface:
export interface BonusVerifyOptions {
  casino?: string;      // single casino ID to check
  noCache?: boolean;    // skip cache
  maxCacheAge?: number; // days before re-extraction (default 7)
  autoUpdate?: boolean; // bump last_verified for confirmed
  json?: boolean;       // suppress console output
}

export interface BonusVerifyResult {
  report: VerificationReport;
  updatedCasinos: string[]; // IDs that had last_verified bumped
}

export async function runBonusVerification(options: BonusVerifyOptions): Promise<BonusVerifyResult>
```

Move all the logic from the current `verify-bonuses.ts` main body (lines 113-234) into this function. Replace `process.exit()` calls with `return`. Replace `console.log` calls with conditional output controlled by `options.json`.

- [ ] **Step 2: Slim down verify-bonuses.ts to a thin CLI wrapper**

```typescript
// scripts/verify-bonuses.ts — thin wrapper
import { runBonusVerification } from "./verify-bonuses-lib.js";
import { formatBonusReport } from "@bambushu/casino-guard";

const args = process.argv.slice(2);
const flags = {
  autoUpdate: args.includes("--auto-update"),
  noCache: args.includes("--no-cache"),
  json: args.includes("--json"),
  casino: args.includes("--casino") ? args[args.indexOf("--casino") + 1] : undefined,
  maxCacheAge: args.includes("--max-cache-age") ? Number(args[args.indexOf("--max-cache-age") + 1]) : 7,
};

runBonusVerification(flags).then(({ report }) => {
  if (!flags.json) console.log(formatBonusReport(report));
  else console.log(JSON.stringify(report, null, 2));
  if (report.summary.errors > 0) process.exit(2);
  if (report.summary.mismatched > 0) process.exit(1);
  process.exit(0);
}).catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
```

- [ ] **Step 3: Verify existing CLI still works**

Run: `npx tsx scripts/verify-bonuses.ts --casino holland-casino-online --json`
Expected: Same JSON output as before the refactor. Exit code 0 if confirmed.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-bonuses-lib.ts scripts/verify-bonuses.ts
git commit -m "refactor: extract verify-bonuses core into importable lib"
```

---

### Task 2: Refactor verify-promotions.ts into lib + CLI wrapper

Same pattern as Task 1, for the promotions verification.

**Files:**
- Create: `scripts/verify-promotions-lib.ts`
- Modify: `scripts/verify-promotions.ts`

- [ ] **Step 1: Create verify-promotions-lib.ts**

```typescript
// scripts/verify-promotions-lib.ts
export interface PromoVerifyOptions {
  casino?: string;   // single casino slug
  noCache?: boolean;
  dryRun?: boolean;  // don't write to src/promotions.ts
  json?: boolean;
}

export interface PromoVerifyResult {
  report: SyncReport; // from casino-guard types
  added: number;
  removed: number;
  unchanged: number;
}

export async function runPromoVerification(options: PromoVerifyOptions): Promise<PromoVerifyResult>
```

Move the core loop (lines 123-240) into this function. The `PROMO_URLS` map (lines 37-50), `fetchWithBrowser` helper (lines 54-72), and `writePromotions` (lines 76-95) all move to the lib. Replace `process.exit()` with return.

- [ ] **Step 2: Slim down verify-promotions.ts to CLI wrapper**

Same pattern as Task 1, Step 2. Parse args, call `runPromoVerification()`, format output, exit.

- [ ] **Step 3: Verify existing CLI still works**

Run: `npx tsx scripts/verify-promotions.ts --casino betcity --dry-run --json`
Expected: Same JSON output. No writes to src/promotions.ts.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-promotions-lib.ts scripts/verify-promotions.ts
git commit -m "refactor: extract verify-promotions core into importable lib"
```

---

### Task 3: Build the auto-update rules module

Implements the confidence-based mismatch handling from the spec.

**Files:**
- Create: `scripts/auto-update-rules.ts`
- Create: `scripts/__tests__/auto-update-rules.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// scripts/__tests__/auto-update-rules.test.ts
import { describe, it, expect } from "vitest";
import { classifyMismatches } from "../auto-update-rules.js";

describe("classifyMismatches", () => {
  it("auto-updates medium priority at 0.9+ confidence", () => {
    const result = classifyMismatches([{
      casino_id: "test", casino_name: "Test", terms_url: "",
      field: "free_spins", our_value: 100, site_value: 200,
      priority: "medium", confidence: 0.95,
    }]);
    expect(result.autoUpdate).toHaveLength(1);
    expect(result.flagged).toHaveLength(0);
  });

  it("auto-updates high priority at 0.9+ confidence", () => {
    const result = classifyMismatches([{
      casino_id: "test", casino_name: "Test", terms_url: "",
      field: "match_percentage", our_value: 100, site_value: 150,
      priority: "high", confidence: 0.92,
    }]);
    expect(result.autoUpdate).toHaveLength(1);
    expect(result.flagged).toHaveLength(0);
  });

  it("never auto-updates bonus_available (critical)", () => {
    const result = classifyMismatches([{
      casino_id: "test", casino_name: "Test", terms_url: "",
      field: "bonus_available", our_value: true, site_value: false,
      priority: "critical", confidence: 0.99,
    }]);
    expect(result.autoUpdate).toHaveLength(0);
    expect(result.flagged).toHaveLength(1);
  });

  it("flags 0.7-0.9 confidence for review", () => {
    const result = classifyMismatches([{
      casino_id: "test", casino_name: "Test", terms_url: "",
      field: "max_bonus_eur", our_value: 200, site_value: 300,
      priority: "high", confidence: 0.82,
    }]);
    expect(result.autoUpdate).toHaveLength(0);
    expect(result.flagged).toHaveLength(1);
  });

  it("skips low confidence entirely", () => {
    const result = classifyMismatches([{
      casino_id: "test", casino_name: "Test", terms_url: "",
      field: "wagering_requirement", our_value: 30, site_value: 25,
      priority: "low", confidence: 0.5,
    }]);
    expect(result.autoUpdate).toHaveLength(0);
    expect(result.flagged).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/__tests__/auto-update-rules.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement auto-update-rules.ts**

```typescript
// scripts/auto-update-rules.ts
import type { Mismatch } from "@bambushu/casino-guard";

export interface ClassifiedMismatches {
  autoUpdate: Mismatch[];  // apply these changes
  flagged: Mismatch[];     // create GitHub Issue for these
  skipped: Mismatch[];     // ignored (low confidence)
}

const AUTO_UPDATE_THRESHOLD = 0.9;
const FLAG_THRESHOLD = 0.7;
const NEVER_AUTO_UPDATE_FIELDS = new Set(["bonus_available"]);

export function classifyMismatches(mismatches: Mismatch[]): ClassifiedMismatches {
  const autoUpdate: Mismatch[] = [];
  const flagged: Mismatch[] = [];
  const skipped: Mismatch[] = [];

  for (const m of mismatches) {
    if (m.confidence < FLAG_THRESHOLD) {
      skipped.push(m);
    } else if (m.confidence < AUTO_UPDATE_THRESHOLD) {
      flagged.push(m);
    } else if (NEVER_AUTO_UPDATE_FIELDS.has(m.field)) {
      flagged.push(m);
    } else {
      autoUpdate.push(m);
    }
  }

  return { autoUpdate, flagged, skipped };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run scripts/__tests__/auto-update-rules.test.ts`
Expected: All 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/auto-update-rules.ts scripts/__tests__/auto-update-rules.test.ts
git commit -m "feat: add confidence-based mismatch classification rules"
```

---

### Task 4: Build the field write-back module

Applies classified auto-update mismatches by writing new values into `src/casinos.ts`. This is the bridge between classification (Task 3) and the orchestrator (Task 5).

**Files:**
- Create: `scripts/field-updater.ts`
- Create: `scripts/__tests__/field-updater.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// scripts/__tests__/field-updater.test.ts
import { describe, it, expect } from "vitest";
import { buildFieldRegex, applyFieldUpdate } from "../field-updater.js";

describe("buildFieldRegex", () => {
  it("matches numeric fields in casino object", () => {
    const regex = buildFieldRegex("holland-casino-online", "wagering_requirement");
    const source = `  "holland-casino-online": {\n    welcome_bonus: {\n      wagering_requirement: 24,`;
    expect(regex.test(source)).toBe(true);
  });
});

describe("applyFieldUpdate", () => {
  it("replaces a numeric value in the correct casino block", () => {
    const source = [
      '"test-casino": {',
      '    welcome_bonus: {',
      '      wagering_requirement: 24,',
      '    }',
      '}',
    ].join("\n");
    const result = applyFieldUpdate(source, "test-casino", "wagering_requirement", 30);
    expect(result).toContain("wagering_requirement: 30,");
    expect(result).not.toContain("wagering_requirement: 24,");
  });

  it("replaces a boolean value", () => {
    const source = '"test-casino": {\n    welcome_bonus: {\n      bonus_available: true,';
    const result = applyFieldUpdate(source, "test-casino", "bonus_available", false);
    expect(result).toContain("bonus_available: false,");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/__tests__/field-updater.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement field-updater.ts**

The updater reads `src/casinos.ts`, finds the casino block by slug, locates the field within it, and replaces the value. Uses a two-step approach: (1) find the casino block boundaries, (2) replace the field value within those boundaries.

```typescript
// scripts/field-updater.ts
import { readFileSync, writeFileSync } from "fs";
import path from "path";

const CASINOS_PATH = path.join(import.meta.dirname, "../src/casinos.ts");

export function buildFieldRegex(casinoSlug: string, field: string): RegExp {
  // Matches field: <value> within a casino block
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run scripts/__tests__/field-updater.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/field-updater.ts scripts/__tests__/field-updater.test.ts
git commit -m "feat: add field-level write-back for auto-update mismatches"
```

---

### Task 5: Build the orchestrator (`daily-verify.ts`)

The main pipeline script that coordinates everything.

**Files:**
- Create: `scripts/daily-verify.ts`

- [ ] **Step 1: Write the orchestrator**

The orchestrator imports the lib functions and coordinates the pipeline. Key sections:

1. **Parse args** — support `--dry-run` and `--casino <slug>` (passed through to both verification libs)
2. **Run bonus verification** — `runBonusVerification({ autoUpdate: true, maxCacheAge: 7, casino })`
3. **Run promo verification** — `runPromoVerification({ dryRun, casino })`
4. **Extract mismatches** — Collect from `bonusReport.report.results.flatMap(r => r.mismatches)`
5. **Classify mismatches** — `classifyMismatches(allMismatches)`
6. **Apply auto-updates** — `applyAutoUpdates(classified.autoUpdate)` (skip in dry-run mode). Log high-priority auto-updates distinctly: `console.log("[HIGH] Auto-updated: ...")`
7. **Early exit check** — If no data changed and no confirmations, exit
8. **Ensure results dir** — `fs.mkdirSync("results", { recursive: true })`
9. **Build** — `execSync("npm run build")`
10. **Git commit data changes** — `git add src/ dist/ && git commit -m "data: daily verification..."`
11. **Version bump** — `execSync("npm version patch --no-git-tag-version")`, read new version, `git add package.json && git commit -m "chore: bump to X.Y.Z"`
12. **Git push** — `execSync("git push origin main")`
13. **Publish** — `execSync("npm publish --registry=https://npm.pkg.github.com")`
14. **Update bonuswijs** — `execSync` in `~/bonuswijs`: `npm install @bambushu/ksa-data@latest && git add package.json package-lock.json && git commit && git push`
15. **Create GitHub Issue** — if `classified.flagged.length > 0`, use `gh issue create`
16. **Write results JSON** — to `results/YYYY-MM-DD.json`

Wrap everything in try/catch. On crash, create GitHub Issue with `[ALERT]` title.

In `--dry-run` mode: run steps 1-7, log what would happen for steps 8-14, write results with `dry_run: true`.

- [ ] **Step 2: Test with dry-run**

Run: `npx tsx scripts/daily-verify.ts --dry-run`
Expected: Runs verification, shows classification results, does NOT commit/push/publish. Creates `results/YYYY-MM-DD.json` with `dry_run: true`.

- [ ] **Step 3: Test with dry-run on single casino**

Run: `npx tsx scripts/daily-verify.ts --dry-run --casino holland-casino-online`
Expected: Verifies only one casino, shows results. Fast (~30s).

- [ ] **Step 4: Commit**

```bash
git add scripts/daily-verify.ts
git commit -m "feat: add daily verification orchestrator with dry-run support"
```

---

### Task 6: Setup infrastructure (wrapper, env, launchd, gitignore)

**Files:**
- Create: `scripts/daily-verify.sh`
- Create: `~/Library/LaunchAgents/nl.bambushu.ksa-verify.plist`
- Create: `~/.config/ksa-verify/env`
- Modify: `.gitignore`

- [ ] **Step 1: Create the shell wrapper**

Write `scripts/daily-verify.sh` exactly as specified in the design doc. Lock file at `/tmp/ksa-verify.lock`, sources `~/.config/ksa-verify/env`, runs `npx tsx scripts/daily-verify.ts "$@"`.

```bash
chmod +x scripts/daily-verify.sh
```

- [ ] **Step 2: Create the env file**

```bash
mkdir -p ~/.config/ksa-verify
```

Write `~/.config/ksa-verify/env` with:
- `ANTHROPIC_API_KEY` (read from current shell: `echo $ANTHROPIC_API_KEY`)
- `PATH` including homebrew, .local/bin, and system paths
- `HOME=/Users/mikes`

Verify: `source ~/.config/ksa-verify/env && echo $ANTHROPIC_API_KEY` should print the key.

- [ ] **Step 3: Add results/ to .gitignore**

Append `results/` to `/Users/mikes/ksa-data/.gitignore`.

- [ ] **Step 4: Create the launchd plist**

Write `~/Library/LaunchAgents/nl.bambushu.ksa-verify.plist` exactly as in the spec. Points to `/bin/bash /Users/mikes/ksa-data/scripts/daily-verify.sh`.

Do NOT load it yet — we'll test manually first.

- [ ] **Step 5: Commit ksa-data files**

```bash
git add scripts/daily-verify.sh .gitignore
git commit -m "feat: add pipeline wrapper script and gitignore results/"
```

Note: The plist and env files are outside the repo — they live on the system.

---

### Task 7: End-to-end test (manual run)

**Files:** None (testing only)

- [ ] **Step 1: Run the wrapper script in dry-run**

```bash
bash scripts/daily-verify.sh --dry-run
```

Expected: Sources env, acquires lock, runs orchestrator in dry-run mode. Verification output shows, results JSON written, no commits/pushes.

- [ ] **Step 2: Verify lock file behavior**

In a second terminal:
```bash
bash scripts/daily-verify.sh --dry-run
```

Expected: "Another run is active (PID XXXX). Exiting."

- [ ] **Step 3: Dry-run on single casino via wrapper**

```bash
bash scripts/daily-verify.sh --dry-run --casino holland-casino-online
```

Expected: Fast run, single casino verified, no commits. Confirms wrapper + orchestrator + `--casino` passthrough all work.

- [ ] **Step 4: Live run on single casino (first real test)**

```bash
npx tsx scripts/daily-verify.ts --casino holland-casino-online
```

Expected: Verifies one casino, bumps last_verified, builds, commits, pushes, publishes, updates bonuswijs. Check:
- `git log --oneline -2` shows data commit + version bump
- `npm view @bambushu/ksa-data version --registry=https://npm.pkg.github.com` shows new patch version
- BonusWijs Vercel deploy triggered

- [ ] **Step 5: Full pipeline live run**

```bash
bash scripts/daily-verify.sh
```

Expected: Full run (~15-20 min). All casinos verified. Results in `results/YYYY-MM-DD.json`. If any flagged items, GitHub Issue created on `Bambushu/ksa-data`.

- [ ] **Step 6: Load the launchd job**

```bash
launchctl load ~/Library/LaunchAgents/nl.bambushu.ksa-verify.plist
launchctl list | grep ksa-verify
```

Expected: Job registered. Will fire at next 12:00 (or on wake if past 12:00).

- [ ] **Step 7: Verify launchd runs correctly**

Force a run: `launchctl start nl.bambushu.ksa-verify`
Then check: `tail -50 ~/Library/Logs/ksa-verify.log`

Expected: Full pipeline output in log. Check results JSON exists for today's date.

---

### Task 8: Add daily-verify script to package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add convenience scripts**

Add to `scripts` in package.json:
```json
"daily-verify": "npx tsx scripts/daily-verify.ts",
"daily-verify:dry": "npx tsx scripts/daily-verify.ts --dry-run"
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "chore: add daily-verify convenience scripts"
```
