export interface FetchResult {
    ok: boolean;
    html: string;
    contentHash: string;
    error?: string;
    method?: "fetch" | "openclaw";
}
export declare function fetchTermsPage(url: string, delayMs?: number): Promise<FetchResult>;
//# sourceMappingURL=fetcher.d.ts.map