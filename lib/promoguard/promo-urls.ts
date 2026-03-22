/** Casino slug → promotions page URL. Only casinos with known promo pages. */
export const PROMO_URLS: Record<string, string> = {
  unibet: "https://www.unibet.nl/promotions",
  casino777: "https://www.casino777.nl/nl/promoties",
  leovegas: "https://www.leovegas.nl/promoties",
  toto: "https://www.toto.nl/acties",
  "jacks-nl": "https://www.jacks.nl/promoties",
  betnation: "https://www.betnation.nl/promoties",
  "711": "https://www.711.nl/promoties",
  kansino: "https://www.kansino.nl/promotions",
  betcity: "https://www.betcity.nl/promoties",
  "fair-play-online": "https://fairplaycasino.nl/promoties",
  circus: "https://www.circus.nl/nl/promoties",
  // "holland-casino-online" — promoties page only shows "MEER INFO" buttons, no promo details. Needs multi-page scraping.
};
