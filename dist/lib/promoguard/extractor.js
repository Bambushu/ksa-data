import { execSync } from "node:child_process";
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
export function buildExtractionPrompt(casinoSlug, pageText) {
    const today = new Date().toISOString().slice(0, 10);
    return `${EXTRACTION_PROMPT}

Casino: ${casinoSlug}
Today's date: ${today}

Page text:
${pageText}`;
}
export function parseExtractionResponse(raw) {
    const cleaned = raw.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
        throw new Error("Expected JSON array from extraction");
    }
    return parsed.filter((p) => p.confidence >= MIN_CONFIDENCE);
}
export async function extractPromotions(casinoSlug, pageText) {
    const prompt = buildExtractionPrompt(casinoSlug, pageText);
    const output = execSync("claude -p --model opus --output-format json", {
        input: prompt,
        encoding: "utf-8",
        maxBuffer: 1024 * 1024,
        timeout: 60_000,
    });
    let text;
    try {
        const parsed = JSON.parse(output);
        text = parsed.result ?? parsed.content ?? parsed.text ?? output;
    }
    catch {
        text = output;
    }
    return parseExtractionResponse(text);
}
//# sourceMappingURL=extractor.js.map