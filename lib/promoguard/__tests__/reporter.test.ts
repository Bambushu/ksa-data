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
