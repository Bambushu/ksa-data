import { execSync } from "node:child_process";
const STRIP_SELECTORS = ["nav", "footer", "header", "script", "style", "noscript", "iframe"];
const STRIP_CLASS_PATTERNS = ["cookie", "consent", "banner", "popup", "modal", "chat"];
/** Strip HTML to clean text, removing nav/footer/cookie elements. */
export function cleanHtml(html, maxTokens = 6000) {
    let cleaned = html;
    for (const tag of STRIP_SELECTORS) {
        cleaned = cleaned.replace(new RegExp(`<${tag}[\\s\\S]*?</${tag}>`, "gi"), "");
    }
    for (const pattern of STRIP_CLASS_PATTERNS) {
        cleaned = cleaned.replace(new RegExp(`<[^>]+class="[^"]*${pattern}[^"]*"[\\s\\S]*?<\\/[^>]+>`, "gi"), "");
    }
    cleaned = cleaned.replace(/<[^>]+>/g, " ");
    cleaned = cleaned.replace(/\s+/g, " ").trim();
    const maxChars = maxTokens * 4;
    if (cleaned.length > maxChars) {
        cleaned = cleaned.slice(0, maxChars) + "\n[truncated]";
    }
    return cleaned;
}
const EXTRACTION_PROMPT = `You are a data extraction assistant. Extract welcome bonus information from this Dutch casino terms page.

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "bonus_available": { "value": true/false, "confidence": 0.0-1.0 },
  "match_percentage": { "value": number|null, "confidence": 0.0-1.0 },
  "max_bonus_eur": { "value": number|null, "confidence": 0.0-1.0 },
  "wagering_requirement": { "value": number|null, "confidence": 0.0-1.0 },
  "wagering_applies_to": { "value": "bonus"|"bonus_plus_deposit"|"winnings"|null, "confidence": 0.0-1.0 },
  "bonus_type": { "value": "deposit_match"|"free_spins"|"combined"|"cashback"|"no_deposit"|null, "confidence": 0.0-1.0 },
  "free_spins": { "value": number|null, "confidence": 0.0-1.0 },
  "min_deposit_eur": { "value": number|null, "confidence": 0.0-1.0 },
  "time_limit_days": { "value": number|null, "confidence": 0.0-1.0 },
  "max_cashout_eur": { "value": number|null, "confidence": 0.0-1.0 }
}

Rules:
- "wagering_applies_to": "bonus" means wagering is on bonus amount only, "bonus_plus_deposit" means bonus + deposit, "winnings" means on winnings from free spins
- Set confidence to 0.0 if the field is not mentioned on the page
- Set value to null if you cannot determine the value
- For match_percentage, extract just the number (100 for "100%")
- For wagering_requirement, extract just the multiplier (30 for "30x")
- bonus_available should be false ONLY if the page clearly states there is no welcome bonus`;
export async function extractBonusData(pageText) {
    const prompt = EXTRACTION_PROMPT + "\n\nHere is the casino terms page text:\n\n" + pageText;
    const output = execSync(`claude -p --model opus --output-format json`, {
        input: prompt,
        encoding: "utf-8",
        maxBuffer: 1024 * 1024,
        timeout: 30_000,
    });
    // claude --output-format json wraps the result — extract the text content
    let text;
    try {
        const parsed = JSON.parse(output);
        text = parsed.result ?? parsed.content ?? parsed.text ?? output;
    }
    catch {
        text = output;
    }
    const jsonStr = text.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
    return JSON.parse(jsonStr);
}
//# sourceMappingURL=extractor.js.map