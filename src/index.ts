// Data
export { casinos } from "./casinos.js";
export { slots } from "./slots.js";
export { promotions } from "./promotions.js";

// Types
export type {
  Casino,
  Slot,
  Promotion,
  WelcomeBonus,
  SportsBonus,
  LiveCasinoBonus,
  BonusVariant,
  GameWeightings,
} from "./types.js";

// Schemas
export {
  casinoSchema,
  casinosArraySchema,
  slotSchema,
  slotsArraySchema,
  promotionSchema,
  promotionsArraySchema,
  welcomeBonusSchema,
  bonusVariantSchema,
  sportsBonusSchema,
  liveCasinoBonusSchema,
  bonusTypeSchema,
  wageringAppliesToSchema,
  gameWeightingsSchema,
} from "./schemas.js";
