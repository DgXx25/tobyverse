import { z } from "zod";
import type { ChatBlockDef } from "@/lib/blocks/types";

const condition = z.object({ text: z.string().trim().min(1).max(100), code: z.number().int().min(0).max(99).optional() });
const hour = z.object({ time: z.string().trim().min(1).max(24), tempC: z.number().finite().min(-100).max(100), condition });
const day = z.object({
  date: z.string().trim().min(1).max(24),
  minC: z.number().finite().min(-100).max(100),
  maxC: z.number().finite().min(-100).max(100),
  rainChance: z.number().int().min(0).max(100).optional(),
  condition,
});

export const weatherSchema = z.object({
  type: z.literal("weather").optional(),
  locale: z.string().trim().min(2).max(16).default("en"),
  labels: z.object({
    current: z.string().trim().min(1).max(40), today: z.string().trim().min(1).max(24),
    feelsLike: z.string().trim().min(1).max(40), humidity: z.string().trim().min(1).max(40),
    wind: z.string().trim().min(1).max(40), nextHours: z.string().trim().min(1).max(40),
    now: z.string().trim().min(1).max(24), threeDay: z.string().trim().min(1).max(40),
  }).partial().optional(),
  location: z.string().trim().min(1).max(120),
  localTime: z.string().trim().max(40).optional(),
  current: z.object({
    tempC: z.number().finite().min(-100).max(100).optional(),
    tempRangeC: z.tuple([z.number().finite().min(-100).max(100), z.number().finite().min(-100).max(100)]).optional(),
    feelsLikeC: z.number().finite().min(-100).max(100).optional(),
    condition,
    humidity: z.number().int().min(0).max(100).optional(),
    windKph: z.number().finite().min(0).max(500).optional(),
    isDay: z.boolean().optional(),
  }),
  hours: z.array(hour).max(8).default([]),
  days: z.array(day).max(3).default([]),
});

export type WeatherBlock = z.infer<typeof weatherSchema>;

export const weatherBlock: ChatBlockDef<WeatherBlock> = {
  id: "weather",
  keys: [
    "weather", "forecast", "temperature outside", "will it rain", "weather in", "weather today",
    "wetter", "vorhersage", "météo", "prévisions météo", "pronóstico del tiempo", "previsión del tiempo", "tiempo hoy", "vai chover", "previsão do tempo", "прогноз погоды", "погода", "hava durumu", "che tempo fa", "previsioni meteo", "weerbericht", "pogoda", "prognoza pogody", "vremea", "vreme", "मौसम", "حالة الطقس", "天气", "天氣", "天気", "날씨",
    "ამინდ", "ამინდზე", "ამინდის", "ამინდი", "ამინდის პროგნოზ", "წვიმს", "იწვიმებს", "ტემპერატურა გარეთ", "ქარი გარეთ",
  ],
  when: "Use for straightforward current or future weather when web search finds verified conditions; do not leave those conditions only in prose.",
  schema: weatherSchema,
  card: () => `For current or future weather, use Claude's web_search. Search in English, even if the user asked in another language, and answer in the user's language. Include the exact city and country with today's local date in your search query. Prefer an official national meteorological service or an established local weather service; ignore news and travel articles. For a Georgian city, the first search must target amindige.com; if it does not return current conditions for the requested city, the second search must target meteo.gov.ge or amindi.net. Use a current observation or a forecast explicitly valid for that location today, and preserve its timestamp when available. If the first results do not show a current observation or today's forecast and the location is outside Georgia, use the second and final search with a focused English query for the city's official/local forecast. Never combine conflicting values from different sources. If neither search finds reliable current data, say so in one short sentence and omit the card. If a reliable source supports the condition and a temperature or temperature range, you MUST render this card; do not leave supported weather facts only in prose. Do not call a separate weather API or invent data. This card is not for historical weather, climate, or general science explanations. If location is missing, ask which city to check. Omit unsupported forecast fields.
Return one valid weather JSON fence with the requested location and a localized current condition. Add numeric observations, forecasts, and localTime only when the source explicitly supports each value and its timestamp. Never copy example dates or values from this instruction; none are facts about the current request. Translate labels and condition descriptions into the user's language; preserve numeric values and the location. Localized label fields may be omitted when unnecessary; the UI has defaults. Use tempRangeC as [minimum, maximum] when a source gives a range instead of an exact current value; never replace a range with an invented midpoint. When available, include up to six verified hourly points for today; otherwise include up to three daily points. The card lays these out horizontally with weather symbols. For a plain weather question, answer with exactly one concise, natural sentence (about 6–16 words) stating the condition and useful takeaway. Do not repeat temperature, feels-like or high/low values because the card shows them. Do not talk about websites, search, citations, or stale/conflicting sources. Do not add a recap or generic tip. The app attaches search citations automatically; never add a Sources heading or source list. For broader weather analysis, match the depth requested. Never fabricate source names or links.`,
};
