import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const MIN_CONTENT_LENGTH = 500; // if less than this, content is probably JS-rendered
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
/** Try fetching with OpenClaw browser (renders JS, handles SPAs). */
function fetchWithOpenClaw(url) {
    try {
        execSync(`openclaw browser open "${url}"`, { timeout: 15_000, stdio: "pipe" });
        // Wait for page to load
        execSync(`openclaw browser wait --timeout 5000 --load networkidle`, { timeout: 10_000, stdio: "pipe" });
    }
    catch {
        // wait may fail, but page might still have loaded — continue
    }
    try {
        const text = execSync(`openclaw browser evaluate --fn "(function() { return document.body.innerText; })"`, { timeout: 10_000, encoding: "utf-8" });
        if (!text || text.trim().length < MIN_CONTENT_LENGTH) {
            return { ok: false, html: "", contentHash: "", error: "OpenClaw: page content too short", method: "openclaw" };
        }
        const contentHash = createHash("sha256").update(text).digest("hex");
        return { ok: true, html: text, contentHash, method: "openclaw" };
    }
    catch (err) {
        return { ok: false, html: "", contentHash: "", error: `OpenClaw failed: ${err}`, method: "openclaw" };
    }
}
export async function fetchTermsPage(url, delayMs = 1500) {
    if (delayMs > 0)
        await sleep(delayMs);
    // Stage 1: try fast fetch()
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await fetch(url, {
                headers: { "User-Agent": USER_AGENT },
                signal: AbortSignal.timeout(15_000),
                redirect: "follow",
            });
            if (!res.ok) {
                if (attempt === 0 && RETRYABLE.has(res.status)) {
                    await sleep(3000);
                    continue;
                }
                break; // fall through to OpenClaw
            }
            const html = await res.text();
            // Check if content is substantial (not a JS shell)
            const textContent = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
            if (textContent.length >= MIN_CONTENT_LENGTH) {
                const contentHash = createHash("sha256").update(html).digest("hex");
                return { ok: true, html, contentHash, method: "fetch" };
            }
            // Content too thin — fall through to OpenClaw
            break;
        }
        catch (err) {
            if (attempt === 0) {
                await sleep(3000);
                continue;
            }
            break; // fall through to OpenClaw
        }
    }
    // Stage 2: fallback to OpenClaw browser
    return fetchWithOpenClaw(url);
}
//# sourceMappingURL=fetcher.js.map