import { z } from "zod";

export const bonusTypeSchema = z.enum([
  "deposit_match", "free_spins", "no_deposit", "cashback", "combined",
]);

export const wageringAppliesToSchema = z.enum([
  "bonus", "bonus_plus_deposit", "winnings",
]);

export const gameWeightingsSchema = z.object({
  slots: z.number().min(0).max(1),
  live_casino: z.number().min(0).max(1),
  table_games: z.number().min(0).max(1),
  video_poker: z.number().min(0).max(1),
});

export const welcomeBonusSchema = z.object({
  type: bonusTypeSchema,
  match_percentage: z.number().min(0),
  max_bonus_eur: z.number().min(0),
  free_spins: z.number().min(0),
  free_spins_value_eur: z.number().min(0),
  wagering_requirement: z.number().min(0),
  wagering_applies_to: wageringAppliesToSchema,
  min_deposit_eur: z.number().min(0),
  max_deposit_eur: z.number().min(0).optional(),
  qualifying_wager_eur: z.number().min(0).optional(),
  free_spins_wagering_requirement: z.number().min(0).optional(),
  free_spins_rtp: z.number().min(0).max(1).optional(),
  fixed_wagering_eur: z.number().min(0).optional(),
  max_cashout_eur: z.number().min(0).nullable(),
  time_limit_days: z.number().min(1),
  game_weightings: gameWeightingsSchema,
  excluded_slots: z.array(z.string()),
  min_odds: z.number().nullable(),
  notes: z.string().optional(),
  max_bet_per_spin_eur: z.number().min(0).nullable().optional(),
});

export const bonusVariantSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: bonusTypeSchema,
  min_deposit_eur: z.number().min(0),
  match_percentage: z.number().min(0).optional(),
  max_bonus_eur: z.number().min(0).optional(),
  free_spins: z.number().min(0).optional(),
  free_spins_value_eur: z.number().min(0).optional(),
  wagering_requirement: z.number().min(0).optional(),
  wagering_applies_to: wageringAppliesToSchema.optional(),
  qualifying_wager_eur: z.number().min(0).optional(),
  fixed_wagering_eur: z.number().min(0).optional(),
  free_spins_rtp: z.number().min(0).max(1).optional(),
  free_spins_wagering_requirement: z.number().min(0).optional(),
  notes: z.string().optional(),
});

export const sportsBonusSchema = z.object({
  type: z.enum(["free_bet", "profit_boost", "odds_boost", "bet_x_get_y", "other"]),
  summary: z.string(),
  min_deposit_eur: z.number().nullable(),
  min_odds: z.number().nullable(),
  wagering_requirement: z.number().nullable(),
  qualifying_wager_eur: z.number().nullable(),
  time_limit_days: z.number().nullable(),
  notes: z.string().optional(),
  last_verified: z.string().optional(),
});

export const liveCasinoBonusSchema = z.object({
  type: z.enum(["free_chips", "coupons", "cashback", "cash_match", "other"]),
  summary: z.string(),
  min_deposit_eur: z.number().nullable(),
  max_bonus_eur: z.number().nullable(),
  max_win_eur: z.number().nullable(),
  wagering_requirement: z.number().nullable(),
  qualifying_wager_eur: z.number().nullable(),
  time_limit_days: z.number().nullable(),
  eligible_games: z.array(z.string()).optional(),
  notes: z.string().optional(),
  last_verified: z.string().optional(),
});

export const casinoSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  ksa_license: z.string(),
  default_slot_rtp: z.number().min(0.85).max(1),
  withdrawal_time_hours: z.number().min(0),
  logo_component: z.string(),
  rating_math: z.number().min(0).max(10),
  terms_url: z.string().url().nullable().optional(),
  last_verified: z.string(),

  welcome_bonus_available: z.boolean().optional(),
  bonus_category: z.enum(["casino", "sports", "mixed"]).optional(),
  tiered_bonus: z.boolean().optional(),
  package_type: z.enum(["single", "tiered", "multi_deposit", "additive"]).optional(),
  multi_deposit_amounts: z.array(z.number()).optional(),

  welcome_bonus: welcomeBonusSchema,
  sports_bonus: sportsBonusSchema.optional(),
  live_casino_bonus: liveCasinoBonusSchema.optional(),
  bonus_variants: z.array(bonusVariantSchema).optional(),
});

export const casinosArraySchema = z.array(casinoSchema).superRefine((casinos, ctx) => {
  const slugs = new Set<string>();
  const ids = new Set<string>();
  for (const casino of casinos) {
    if (slugs.has(casino.slug)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate slug: ${casino.slug}` });
    }
    slugs.add(casino.slug);
    if (ids.has(casino.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate id: ${casino.id}` });
    }
    ids.add(casino.id);
    if (casino.bonus_variants) {
      const variantIds = new Set<string>();
      for (const v of casino.bonus_variants) {
        if (variantIds.has(v.id)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate variant id: ${v.id} in ${casino.slug}` });
        }
        variantIds.add(v.id);
      }
    }
  }
});

export const slotSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  rtp: z.number().min(0.85).max(1),
  volatility: z.enum(["low", "medium", "high"]),
  provider: z.string().min(1),
});

export const slotsArraySchema = z.array(slotSchema).superRefine((slots, ctx) => {
  const ids = new Set<string>();
  for (const slot of slots) {
    if (ids.has(slot.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate slot id: ${slot.id}` });
    }
    ids.add(slot.id);
  }
});
