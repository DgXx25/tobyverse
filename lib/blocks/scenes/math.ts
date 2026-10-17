/** Pure local calculations for illustrative scenes; never contact a model. */
export function normalPdf(x: number): number {
  return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
}

function logGamma(x: number): number {
  const p = [676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];
  const z = x - 1;
  let a = 0.9999999999998099;
  for (let index = 0; index < p.length; index++) a += p[index] / (z + index + 1);
  const t = z + p.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

export function studentTPdf(x: number, df: number): number {
  if (!Number.isFinite(df) || df < 1) return NaN;
  return Math.exp(logGamma((df + 1) / 2) - logGamma(df / 2) - 0.5 * Math.log(df * Math.PI) - (df + 1) / 2 * Math.log1p(x * x / df));
}

/** Simpson integration of the symmetric central interval [-cutoff, cutoff]. */
export function centralArea(cutoff: number, df?: number): number {
  const end = Math.abs(cutoff);
  const n = 256;
  const h = end / n;
  const pdf = (x: number) => df === undefined ? normalPdf(x) : studentTPdf(x, df);
  let sum = pdf(0) + pdf(end);
  for (let index = 1; index < n; index++) sum += (index % 2 ? 4 : 2) * pdf(index * h);
  return Math.min(1, Math.max(0, 2 * h * sum / 3));
}

export function marketEquilibrium(demandShift: number, supplyShift: number) {
  const demand = 85 + demandShift;
  const supply = 15 + supplyShift;
  const quantity = (demand - supply) / 1.6;
  return { quantity, price: supply + 0.8 * quantity, demand, supply };
}
