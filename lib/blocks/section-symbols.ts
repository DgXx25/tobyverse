import type { UiIconName } from "@/components/workspace/ui-icon";

/** One source for the model's meaning guide, validated ids and rendered glyphs. */
export const SECTION_SYMBOLS = {
  shuffle: { icon: "shuffle", meaning: "choices, alternatives or branching", terms: ["choice", "option", "alternative", "branch", "არჩევ", "ალტერნატივ", "ვარიანტ"] , priority: 60 },
  filter: { icon: "filter", meaning: "criteria, rules or narrowing options", terms: ["criteria", "criterion", "rule", "condition", "კრიტერიუმ", "წესი", "შეზღუდვ"] , priority: 65 },
  search: { icon: "search", meaning: "investigation, causes or verification", terms: ["investigat", "verify", "cause", "reason", "მიზეზ", "გამოკვლ", "დადგენ", "გადამოწმ"] , priority: 60 },
  idea: { icon: "bulb", meaning: "a key idea, concept or intuition", terms: ["concept", "idea", "intuition", "principle", "იდეა", "ცნებ", "პრინციპ", "მთავარი აზრ"] , priority: 55 },
  check: { icon: "check", meaning: "a result, confirmation or completed condition", terms: ["result", "outcome", "confirm", "verified", "შედეგ", "დადასტურ", "შემოწმებ"] , priority: 65 },
  warning: { icon: "warning", meaning: "a risk, limitation, caution or error", terms: ["risk", "danger", "limitation", "caution", "warning", "საფრთხ", "შეზღუდვ", "სიფრთხილ", "შეცდომ"] , priority: 95 },
  calculate: { icon: "usage", meaning: "a calculation, formula, percentage or equation", terms: ["calculat", "percent", "equation", "formula", "solve", "გამოთვლ", "პროცენტ", "განტოლ", "ფორმულ", "ამოხს"] , priority: 85 },
  code: { icon: "file", meaning: "code, programming or implementation", terms: ["code", "coding", "function", "script", "program", "კოდ", "პროგრამ", "ფუნქცი"] , priority: 100 },
  goal: { icon: "flag", meaning: "a goal, target or intended outcome", terms: ["goal", "objective", "target", "aim", "მიზან", "სამიზნ", "ამოცან"] , priority: 70 },
  note: { icon: "notes", meaning: "a note, fact or contextual detail", terms: ["note", "fact", "context", "detail", "შენიშვნ", "ფაქტ", "კონტექსტ", "დეტალ"] , priority: 40 },
  process: { icon: "activity", meaning: "a mechanism, process or ordered stages", terms: ["process", "mechanism", "procedure", "sequence", "stage", "step", "პროცეს", "მექანიზმ", "ეტაპ", "ნაბიჯ", "ფაზ", "თანმიმდევ"] , priority: 55 },
  compare: { icon: "deck", meaning: "a comparison, difference or tradeoff", terms: ["compar", "difference", "versus", "tradeoff", "შედარ", "განსხვავ", "შორის"] , priority: 80 },
  temperature: { icon: "thermometer", meaning: "temperature, heating, cooling or heat", terms: ["temperature", "heating", "cooling", "warm", "cold", "heat", "ტემპერატ", "გაცხელ", "გათბ", "გაგრილ", "სიცხ", "სითბ"] , priority: 95 },
  water: { icon: "droplet", meaning: "water, liquid, evaporation or vapor", terms: ["water", "liquid", "evaporat", "vapor", "steam", "წყალ", "თხევად", "სითხ", "აორთქლ", "ორთქლ"] , priority: 90 },
  flame: { icon: "flame", meaning: "boiling, burning or combustion", terms: ["boil", "burn", "combust", "boiling", "დუღ", "ცეცხლ", "წვა", "იწვის"] , priority: 100 },
} as const satisfies Record<string, { icon: UiIconName; meaning: string; terms: readonly string[]; priority: number }>;

export type SectionSymbol = keyof typeof SECTION_SYMBOLS;
export const SECTION_SYMBOL_IDS = Object.keys(SECTION_SYMBOLS) as [SectionSymbol, ...SectionSymbol[]];

export const SECTION_SYMBOL_GUIDE = SECTION_SYMBOL_IDS
  .map((id) => `${id}: ${SECTION_SYMBOLS[id].meaning}`)
  .join("; ");

/** Specific row wording wins over a mismatched generic symbol chosen by the model. */
export function resolveSectionSymbol(title: string, text: string, fallback: SectionSymbol): SectionSymbol {
  const source = `${title} ${text}`.toLocaleLowerCase();
  const match = SECTION_SYMBOL_IDS
    .flatMap((id) => SECTION_SYMBOLS[id].terms
      .filter((term) => source.includes(term))
      .map((term) => ({ id, priority: SECTION_SYMBOLS[id].priority, length: term.length })))
    .sort((a, b) => b.priority - a.priority || b.length - a.length)[0];
  return match?.id ?? fallback;
}
