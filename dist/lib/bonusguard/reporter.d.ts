import type { VerificationReport } from "./types.js";
export declare function formatReport(report: VerificationReport): string;
export declare function saveReport(report: VerificationReport): void;
export declare function bumpLastVerified(confirmedIds: string[], today: string): number;
//# sourceMappingURL=reporter.d.ts.map