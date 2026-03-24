export interface GameWeightings {
  slots: number;
  live_casino: number;
  table_games: number;
  video_poker: number;
}

export interface WelcomeBonus {
  type: "deposit_match" | "free_spins" | "no_deposit" | "cashback" | "combined";
  match_percentage: number;
  max_bonus_eur: number;
  free_spins: number;
  free_spins_value_eur: number;
  wagering_requirement: number;
  wagering_applies_to: "bonus" | "bonus_plus_deposit" | "winnings";
  min_deposit_eur: number;
  max_deposit_eur?: number;
  qualifying_wager_eur?: number;
  free_spins_wagering_requirement?: number;
  free_spins_rtp?: number;
  fixed_wagering_eur?: number;
  max_cashout_eur: number | null;
  time_limit_days: number;
  game_weightings: GameWeightings;
  excluded_slots: string[];
  min_odds: number | null;
  notes?: string;
  max_bet_per_spin_eur?: number | null;
}

export interface SportsBonus {
  type: "free_bet" | "profit_boost" | "odds_boost" | "bet_x_get_y" | "other";
  summary: string;
  min_deposit_eur: number | null;
  min_odds: number | null;
  wagering_requirement: number | null;
  qualifying_wager_eur: number | null;
  time_limit_days: number | null;
  notes?: string;
  last_verified?: string;
}

export interface LiveCasinoBonus {
  type: "free_chips" | "coupons" | "cashback" | "cash_match" | "other";
  summary: string;
  min_deposit_eur: number | null;
  max_bonus_eur: number | null;
  max_win_eur: number | null;
  wagering_requirement: number | null;
  qualifying_wager_eur: number | null;
  time_limit_days: number | null;
  eligible_games?: string[];
  notes?: string;
  last_verified?: string;
}

export interface BonusVariant {
  id: string;
  name: string;
  type: "deposit_match" | "free_spins" | "no_deposit" | "cashback" | "combined";
  min_deposit_eur: number;
  match_percentage?: number;
  max_bonus_eur?: number;
  free_spins?: number;
  free_spins_value_eur?: number;
  wagering_requirement?: number;
  wagering_applies_to?: "bonus" | "bonus_plus_deposit" | "winnings";
  qualifying_wager_eur?: number;
  fixed_wagering_eur?: number;
  free_spins_rtp?: number;
  free_spins_wagering_requirement?: number;
  time_limit_days?: number;
  max_cashout_eur?: number | null;
  notes?: string;
}

export interface Casino {
  id: string;
  name: string;
  slug: string;
  ksa_license: string;
  default_slot_rtp: number;
  withdrawal_time_hours: number;
  logo_component: string;
  rating_math: number;
  terms_url?: string | null;
  last_verified: string;

  welcome_bonus_available?: boolean;
  bonus_category?: "casino" | "sports" | "mixed";
  tiered_bonus?: boolean;
  package_type?: "single" | "tiered" | "multi_deposit" | "additive" | "choice";
  multi_deposit_amounts?: number[];

  welcome_bonus: WelcomeBonus;
  sports_bonus?: SportsBonus;
  live_casino_bonus?: LiveCasinoBonus;
  bonus_variants?: BonusVariant[];
}

export interface Slot {
  id: string;
  name: string;
  rtp: number;
  volatility: "low" | "medium" | "high";
  provider: string;
}

export interface Promotion {
  id: string;
  casino_slug: string;
  title: string;
  type: "deposit_bonus" | "free_spins" | "cashback" | "tournament" | "other";
  description: string;
  bonus_value?: number;
  wagering_multiplier?: number;
  starts: string;
  expires: string;
  terms_url?: string;
  last_verified: string;
}
