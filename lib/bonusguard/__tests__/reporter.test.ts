import { describe, it, expect } from "vitest";
import { formatReport } from "../reporter.js";
import type { VerificationReport } from "../types.js";

describe("formatReport", () => {
  it("formats a report with mismatches and confirmed casinos", () => {
    const report: VerificationReport = {
      date: "2026-03-20",
      results: [
        { casino_id: "a", casino_name: "Casino A", status: "confirmed", mismatches: [] },
        {
          casino_id: "b", casino_name: "Casino B", status: "mismatch",
          mismatches: [{
            casino_id: "b", casino_name: "Casino B", terms_url: "https://b.nl/terms",
            field: "wagering_requirement", our_value: 30, site_value: 40, priority: "high", confidence: 0.9,
          }],
        },
        { casino_id: "c", casino_name: "Casino C", status: "skipped", mismatches: [], reason: "no terms_url" },
      ],
      summary: { checked: 2, confirmed: 1, mismatched: 1, skipped: 1, errors: 0 },
    };

    const output = formatReport(report);
    expect(output).toContain("Casino B");
    expect(output).toContain("wagering_requirement");
    expect(output).toContain("ours=30");
    expect(output).toContain("site=40");
    expect(output).toContain("1 casinos confirmed");
    expect(output).toContain("1 casinos need manual review");
  });
});
