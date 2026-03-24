# Daily KSA-Data Verification Pipeline

**Date:** 2026-03-24
**Status:** Approved design, pending implementation

## Problem

Casino bonus data in ksa-data goes stale because `last_verified` dates are only updated manually. BonusWijs shows amber/red freshness dots when data is more than 2-3 days old, eroding user trust. Meanwhile, casinos can change their bonus terms at any time without notice.

## Solution

A daily local pipeline that verifies all casino bonus data against official casino websites, auto-updates confirmed data and high-confidence changes, publishes a new ksa-data version, and triggers a BonusWijs redeploy. Silent when everything passes. Creates a GitHub Issue when human review is needed.

## Architecture

```
12:00 daily (launchd)
    │
    ▼
┌──────────────────────────────────┐
│  daily-verify.sh (wrapper)       │
│  - sources env vars              │
│  - acquires lock                 │
│  - exec daily-verify.ts          │
├──────────────────────────────────┤
│  daily-verify.ts (orchestrator)  │
├──────────────────────────────────┤
│ 1. Import + call verify logic    │ ← no subprocess, direct import
│ 2. Apply mismatch auto-update    │
│ 3. Early exit if no changes      │
│ 4. npm run build                 │
│ 5. git commit (data changes)     │
│ 6. npm version patch             │
│ 7. git commit (version bump)     │
│ 8. git push                      │
│ 9. npm publish                   │ ← last destructive action
│ 10. Update bonuswijs dep         │ → triggers Vercel deploy
│ 11. Create GitHub Issue          │ ← only if flagged items
│ 12. Write results JSON           │
└──────────────────────────────────┘
    │                 │
    ▼                 ▼
casino-guard      GitHub Packages
(fetch + LLM)     (@bambushu/ksa-data@x.y.z)
                      │
                      ▼
                  BonusWijs
                  (Vercel auto-deploy)
```

## Components

### 1. Wrapper script (`ksa-data/scripts/daily-verify.sh`)

Shell script that handles environment setup before the TypeScript orchestrator runs:

```bash
#!/bin/bash
set -euo pipefail

# Lock file — prevent concurrent runs
LOCKFILE="/tmp/ksa-verify.lock"
if [ -f "$LOCKFILE" ]; then
    PID=$(cat "$LOCKFILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "Another run is active (PID $PID). Exiting."
        exit 0
    fi
    rm -f "$LOCKFILE"
fi
echo $$ > "$LOCKFILE"
trap 'rm -f "$LOCKFILE"' EXIT INT TERM

# Source credentials from dedicated env file
source ~/.config/ksa-verify/env

# Run orchestrator
cd /Users/mikes/ksa-data
npx tsx scripts/daily-verify.ts "$@"
```

The `~/.config/ksa-verify/env` file contains:
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export PATH="/Users/mikes/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export HOME="/Users/mikes"
```

This solves the launchd environment problem — launchd doesn't source shell profiles, so credentials must come from an explicit file.

### 2. Orchestrator (`ksa-data/scripts/daily-verify.ts`)

Imports verification logic directly (not subprocess) to avoid exit code issues:

```typescript
// Pseudocode structure
import { runBonusVerification } from "./verify-bonuses-lib";
import { runPromoVerification } from "./verify-promotions-lib";

async function main() {
  // 1. Run bonus verification (returns report, doesn't exit)
  const bonusReport = await runBonusVerification({ autoUpdate: true, json: true });

  // 2. Run promo verification (returns report, doesn't exit)
  const promoReport = await runPromoVerification({ json: true });

  // 3. Apply mismatch auto-update rules
  const { applied, flagged } = applyMismatchRules(bonusReport);

  // 4. Early exit if nothing changed
  if (applied.length === 0 && promoReport.added === 0 && promoReport.removed === 0) {
    // Only last_verified bumps — still worth publishing
    if (bonusReport.confirmed === 0) {
      console.log("No changes and no confirmations. Exiting.");
      return;
    }
  }

  // 5-9. Build, commit, version, push, publish (in safe order)
  await buildAndPublish();

  // 10. Update bonuswijs
  await updateBonuswijs();

  // 11. Create GitHub Issue if flagged items
  if (flagged.length > 0) {
    await createGitHubIssue(flagged);
  }

  // 12. Write results
  await writeResults({ bonusReport, promoReport, applied, flagged });
}
```

This requires refactoring `verify-bonuses.ts` and `verify-promotions.ts` to extract their core logic into importable functions, keeping the CLI wrappers as thin entry points. The `process.exit()` calls stay in the CLI wrappers only.

### 3. Build + Publish Order (safe sequence)

```
npm run build
  ↓
git add src/ dist/
git commit -m "data: daily verification YYYY-MM-DD (X confirmed, Y updated, Z flagged)"
  ↓
npm version patch --no-git-tag-version
git add package.json
git commit -m "chore: bump version to X.Y.Z"
  ↓
git push origin main          ← if this fails, no publish happens
  ↓
npm publish --registry=https://npm.pkg.github.com   ← last, hardest to undo
```

Rationale: publish is the last step because it's irreversible (can't unpublish a version on GitHub Packages). If git push fails, we don't publish a version that doesn't match the repo.

### 4. Auto-Update Rules

Applied to each mismatch returned by `compareBonusData()`:

| Confidence | Field Priority | Action |
|-----------|---------------|--------|
| >= 0.9 | Medium (`free_spins`, `min_deposit_eur`, `time_limit_days`, `max_cashout_eur`) | Auto-update silently |
| >= 0.9 | Low | Auto-update silently |
| >= 0.9 | High (`match_percentage`, `max_bonus_eur`, `wagering_requirement`, `wagering_applies_to`, `bonus_type`) | Auto-update, include in daily summary log |
| >= 0.9 | Critical (`bonus_available`) | **Never auto-update.** Flag for review via GitHub Issue. |
| 0.7 - 0.9 | Any | Flag for review via GitHub Issue |
| < 0.7 | Any | Skip entirely (LLM unsure, not actionable) |

Note: the existing comparator already downgrades mismatches with confidence < 0.7 to priority "low", which causes `verify-bonuses.ts` to mark those casinos as "confirmed." This is correct behavior — low-confidence disagreements don't block `last_verified` bumps. The orchestrator's auto-update rules layer on top of this existing behavior.

### 5. launchd Plist (`~/Library/LaunchAgents/nl.bambushu.ksa-verify.plist`)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>nl.bambushu.ksa-verify</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/Users/mikes/ksa-data/scripts/daily-verify.sh</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/mikes/ksa-data</string>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>12</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/Users/mikes/Library/Logs/ksa-verify.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/mikes/Library/Logs/ksa-verify.log</string>
</dict>
</plist>
```

Key behaviors:
- Runs `/bin/bash` wrapper (not npx directly) — wrapper handles env + lock
- If Mac is asleep at 12:00, launchd runs it when the Mac wakes up
- Logs to `~/Library/Logs/ksa-verify.log`
- No credentials in the plist itself (sourced from `~/.config/ksa-verify/env`)

### 6. Git Authentication

The pipeline does `git push` for both ksa-data and bonuswijs. Both repos use HTTPS remotes with the macOS Keychain credential helper. Under launchd:

- `git credential-osxkeychain` works because launchd agents run in the user's session and have Keychain access
- The wrapper sets `HOME` to ensure git finds `~/.gitconfig`
- SSH-based remotes would NOT work (no SSH agent) — both repos must use HTTPS

### 7. Results Storage

```
ksa-data/results/          ← gitignored
├── 2026-03-24.json
├── 2026-03-25.json
└── ...
```

Add to `.gitignore`: `results/`

Each file contains:
```json
{
  "date": "2026-03-24",
  "bonuses": {
    "checked": 26,
    "confirmed": 23,
    "auto_updated": 2,
    "flagged": 1,
    "errors": 0,
    "details": [...]
  },
  "promos": {
    "checked": 11,
    "added": 3,
    "removed": 1,
    "unchanged": 75,
    "errors": 0
  },
  "published_version": "1.2.15",
  "bonuswijs_deployed": true
}
```

### 8. Dry-run Mode

The orchestrator supports `--dry-run`:
- Runs full verification (fetch + extract + compare)
- Applies auto-update rules and logs what WOULD change
- Does NOT: write to source files, build, commit, push, publish, or deploy
- Creates results JSON with `"dry_run": true`

Usage: `npx tsx scripts/daily-verify.ts --dry-run`

### 9. Pipeline Crash Handling

The orchestrator wraps `main()` in a try/catch. On unhandled error:
- Creates a GitHub Issue titled `[ALERT] Pipeline crash YYYY-MM-DD` with the stack trace
- Exits with code 2
- Lock file is cleaned up by the wrapper's `trap`

## Environment Requirements

| Requirement | Source | Notes |
|------------|--------|-------|
| `ANTHROPIC_API_KEY` | `~/.config/ksa-verify/env` | For casino-guard LLM extraction |
| `~/.npmrc` GitHub Packages token | Already configured | For npm publish |
| `openclaw` CLI | Already installed | For SPA casino site fallback |
| Node.js 20+ | Already installed | Runtime |
| `gh` CLI | Already installed | For creating GitHub Issues |
| HTTPS git credentials | macOS Keychain | For push to ksa-data + bonuswijs |
| `npx`, `tsx` | PATH in env file | For running TypeScript |

## Failure Modes

| Failure | Impact | Handling |
|---------|--------|----------|
| Mac asleep at 12:00 | Delayed run | launchd catches up on wake |
| Concurrent run attempt | Blocked | Lock file prevents duplicate runs |
| Casino site down | That casino not verified | Marked "error", `last_verified` unchanged |
| LLM extraction fails | That casino not verified | Marked "error", existing data preserved |
| Git push fails | No publish happens | Script stops before publish (safe order) |
| npm publish fails | BonusWijs not updated | Logged. Data is committed to repo but not published. |
| Vercel deploy fails | BonusWijs serves old data | Logged. Data is updated in ksa-data. |
| No ANTHROPIC_API_KEY | Entire pipeline fails | Script exits immediately with clear error |
| OpenClaw not running | SPA sites fail stage 2 | Falls back gracefully, those casinos marked "error" |
| GitHub API rate limit | Issue creation fails | Logged, pipeline continues. Review items in results JSON. |
| Orchestrator crashes | Unhandled error | GitHub Issue created with stack trace, lock cleaned up |
| No data changes | Unnecessary publish | Early exit — no build/commit/publish if nothing changed |

## Cost Estimate

- **With cache hits (typical day):** ~$0.75-1.25 (most pages unchanged, cached extractions reused)
- **Without cache (worst case):** ~$2.50 (all 26+11 casinos re-extracted)
- **Monthly estimate:** $25-35
- **Cache max age:** 7 days (shorter than default 30, appropriate for daily runs)

## What This Does NOT Do

- No parallel execution (serial is fine at 15-20 minutes total)
- No web dashboard or UI (results are JSON + GitHub Issues)
- No SMS/push notifications (GitHub email notifications suffice)
- No retry within a single run (next day is the retry)
- No promo URL auto-discovery (hardcoded list of 11 casinos)
- No log rotation (manual cleanup or newsyslog config if needed)

## Implementation Notes

### Refactoring verify scripts

Both `verify-bonuses.ts` and `verify-promotions.ts` need to be split:
- `verify-bonuses-lib.ts` — exports `runBonusVerification(options)` returning a report
- `verify-bonuses.ts` — thin CLI wrapper that calls the lib and does `process.exit()`
- Same pattern for `verify-promotions-lib.ts` / `verify-promotions.ts`

This preserves the existing CLI interface while making the logic importable.

### Early exit logic

The pipeline should still publish when casinos are confirmed (last_verified bumped) even if no data fields changed. The "no changes" early exit only triggers when zero casinos were successfully verified AND zero promo changes — meaning the pipeline accomplished nothing useful.

## Future Considerations

### Expanding ksa-data with more fields

Casino-guard's LLM extraction is prompt-driven. Adding new data points requires:
1. Add fields to `ksa-data/src/types.ts` (e.g., `payment_methods`, `game_count`, `support_hours`, `mobile_app`)
2. Expand the extraction prompt in `casino-guard/src/bonus-extractor.ts`
3. Add comparison rules in `casino-guard/src/comparator.ts`
4. Add fields to `ksa-data/src/casinos.ts`

The pipeline itself doesn't change — verify, compare, update works for any number of fields.

### New markets (UK, DE)

The architecture is market-agnostic. To add a market:
1. Create `@bambushu/uk-data` (or `de-data`) with the same structure
2. Populate with licensed operators for that jurisdiction
3. Add `terms_url` for each operator
4. Reuse casino-guard as-is (extraction prompts work in English and German)
5. Clone the daily-verify pipeline, point it at the new data package

Each market gets its own package, its own verification schedule, and its own consumer sites.

### Migration to CI (future)

If running locally becomes unreliable, the pipeline can move to:
- GitHub Actions with Browserbase for JS rendering (replaces OpenClaw)
- Scheduled workflow (cron) instead of launchd
- Same orchestrator script, different trigger mechanism
