import type { Promotion } from "./types.js";
import { promotionsArraySchema } from "./schemas.js";

export const promotions: Promotion[] = [];

promotionsArraySchema.parse(promotions);
