export type WeatherMood = "clear" | "cloudy" | "rain" | "snow" | "storm" | "night";

/** Prefer standard weather codes; localized condition text is a lightweight fallback. */
export function weatherMood(code?: number, conditionText = "", isDay = true): WeatherMood {
  if (!isDay) return "night";
  if (code === 95 || code === 96 || code === 99 || /thunder|storm|ჭექ|ქარიშხ/iu.test(conditionText)) return "storm";
  if ([71, 73, 75, 77, 85, 86].includes(code ?? -1) || /snow|თოვ/iu.test(conditionText)) return "snow";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code ?? -1) || /rain|drizzle|shower|წვიმ/iu.test(conditionText)) return "rain";
  if ([2, 3, 45, 48].includes(code ?? -1) || /cloud|overcast|fog|მოღრუბლ|ღრუბ|ნისლ/iu.test(conditionText)) return "cloudy";
  return "clear";
}
