const FIELD_PRIORITY = {
    bonus_available: "critical",
    match_percentage: "high",
    max_bonus_eur: "high",
    wagering_requirement: "high",
    wagering_applies_to: "high",
    bonus_type: "high",
    free_spins: "medium",
    min_deposit_eur: "medium",
    time_limit_days: "medium",
    max_cashout_eur: "medium",
};
const CONFIDENCE_THRESHOLD = 0.7;
const COMPARE_FIELDS = [
    "bonus_available", "match_percentage", "max_bonus_eur", "wagering_requirement",
    "wagering_applies_to", "bonus_type", "free_spins", "min_deposit_eur",
    "time_limit_days", "max_cashout_eur",
];
export function compareBonusData(ours, extracted) {
    const mismatches = [];
    for (const field of COMPARE_FIELDS) {
        const ext = extracted[field];
        if (!ext)
            continue;
        const ourValue = ours[field];
        const siteValue = ext.value;
        const confidence = ext.confidence;
        if (confidence < CONFIDENCE_THRESHOLD) {
            if (siteValue !== null && siteValue !== ourValue) {
                mismatches.push({
                    casino_id: ours.casino_id, casino_name: ours.casino_name, terms_url: ours.terms_url,
                    field, our_value: ourValue, site_value: siteValue, priority: "low", confidence,
                });
            }
            continue;
        }
        if (ourValue === null && siteValue === null)
            continue;
        if (ourValue !== siteValue) {
            mismatches.push({
                casino_id: ours.casino_id, casino_name: ours.casino_name, terms_url: ours.terms_url,
                field, our_value: ourValue, site_value: siteValue,
                priority: FIELD_PRIORITY[field] ?? "low", confidence,
            });
        }
    }
    return mismatches;
}
//# sourceMappingURL=comparator.js.map