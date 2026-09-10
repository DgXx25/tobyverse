export type ElementInfo = {
  symbol: string;
  number: number;
  name: string;
};

const ELEMENTS: ElementInfo[] = [
  { symbol: "H", number: 1, name: "Hydrogen" },
  { symbol: "He", number: 2, name: "Helium" },
  { symbol: "Li", number: 3, name: "Lithium" },
  { symbol: "Be", number: 4, name: "Beryllium" },
  { symbol: "B", number: 5, name: "Boron" },
  { symbol: "C", number: 6, name: "Carbon" },
  { symbol: "N", number: 7, name: "Nitrogen" },
  { symbol: "O", number: 8, name: "Oxygen" },
  { symbol: "F", number: 9, name: "Fluorine" },
  { symbol: "Ne", number: 10, name: "Neon" },
  { symbol: "Na", number: 11, name: "Sodium" },
  { symbol: "Mg", number: 12, name: "Magnesium" },
  { symbol: "Al", number: 13, name: "Aluminium" },
  { symbol: "Si", number: 14, name: "Silicon" },
  { symbol: "P", number: 15, name: "Phosphorus" },
  { symbol: "S", number: 16, name: "Sulfur" },
  { symbol: "Cl", number: 17, name: "Chlorine" },
  { symbol: "Ar", number: 18, name: "Argon" },
  { symbol: "K", number: 19, name: "Potassium" },
  { symbol: "Ca", number: 20, name: "Calcium" },
  { symbol: "Cr", number: 24, name: "Chromium" },
  { symbol: "Mn", number: 25, name: "Manganese" },
  { symbol: "Fe", number: 26, name: "Iron" },
  { symbol: "Co", number: 27, name: "Cobalt" },
  { symbol: "Ni", number: 28, name: "Nickel" },
  { symbol: "Cu", number: 29, name: "Copper" },
  { symbol: "Zn", number: 30, name: "Zinc" },
  { symbol: "Br", number: 35, name: "Bromine" },
  { symbol: "Ag", number: 47, name: "Silver" },
  { symbol: "I", number: 53, name: "Iodine" },
  { symbol: "Au", number: 79, name: "Gold" },
  { symbol: "Hg", number: 80, name: "Mercury" },
  { symbol: "Pb", number: 82, name: "Lead" },
  { symbol: "U", number: 92, name: "Uranium" },
];

const BY_SYMBOL = new Map(ELEMENTS.map((item) => [item.symbol.toUpperCase(), item]));

export function lookupElement(id: string): ElementInfo | null {
  const key = id.trim().replace(/[^A-Za-z]/g, "");
  if (!key) return null;
  return BY_SYMBOL.get(key.toUpperCase()) ?? null;
}

export const CATALOG_ELEMENT_IDS = [
  ...ELEMENTS.map((item) => item.symbol),
  "H2O",
  "CO2",
  "O2",
  "N2",
  "NaCl",
  "CH4",
  "NH3",
  "HCl",
  "NaOH",
  "H2SO4",
  "Fe2O3",
  "C6H12O6",
];
