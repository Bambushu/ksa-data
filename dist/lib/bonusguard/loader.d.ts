import type { BonusRecord } from "./types.js";
export interface LoadResult {
    records: BonusRecord[];
    skipped: Array<{
        casino_id: string;
        casino_name: string;
        reason: string;
    }>;
}
export declare function loadCasinoData(filterCasinoId?: string): LoadResult;
//# sourceMappingURL=loader.d.ts.map