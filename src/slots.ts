import type { Slot } from "./types.js";
import { slotsArraySchema } from "./schemas.js";

export const slots: Slot[] = [
  { id: "slot_gates_of_olympus", name: "Gates of Olympus", rtp: 0.9650, volatility: "high", provider: "Pragmatic Play" },
  { id: "slot_book_of_dead", name: "Book of Dead", rtp: 0.9621, volatility: "high", provider: "Play'n GO" },
  { id: "slot_starburst", name: "Starburst", rtp: 0.9609, volatility: "low", provider: "NetEnt" },
  { id: "slot_sweet_bonanza", name: "Sweet Bonanza", rtp: 0.9649, volatility: "high", provider: "Pragmatic Play" },
  { id: "slot_big_bass_bonanza", name: "Big Bass Bonanza", rtp: 0.9671, volatility: "high", provider: "Pragmatic Play" },
  { id: "slot_bonanza_megaways", name: "Bonanza Megaways", rtp: 0.9600, volatility: "high", provider: "Big Time Gaming" },
  { id: "slot_pirots_3", name: "Pirots 3", rtp: 0.9400, volatility: "high", provider: "ELK Studios" },
  { id: "slot_gonzos_quest", name: "Gonzo's Quest", rtp: 0.9597, volatility: "medium", provider: "NetEnt" },
  { id: "slot_reactoonz", name: "Reactoonz", rtp: 0.9651, volatility: "high", provider: "Play'n GO" },
  { id: "slot_fire_joker", name: "Fire Joker", rtp: 0.9615, volatility: "high", provider: "Play'n GO" },
];

slotsArraySchema.parse(slots);
