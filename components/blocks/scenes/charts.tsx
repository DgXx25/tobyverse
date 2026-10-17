"use client";

import { useId, useState } from "react";
import { centralArea, marketEquilibrium, normalPdf, studentTPdf } from "@/lib/blocks/scenes/math";
import { SceneFrame, SceneSlider } from "./frame";

const px = (x: number) => 80 + x * 4.8;
const py = (y: number) => 290 - y * 2.4;

export function MarketScene({ ka, title }: { ka: boolean; title?: string }) {
  const [demandShift, setDemand] = useState(0);
  const [supplyShift, setSupply] = useState(0);
  const id = useId().replace(/:/g, "");
  const eq = marketEquilibrium(demandShift, supplyShift);
  const x = px(eq.quantity), y = py(eq.price);
  return <SceneFrame title={title || (ka ? "მოთხოვნა და მიწოდება" : "Supply and demand")} caption={<><span>{ka ? "საილუსტრაციო მოდელი. წონასწორული ფასი: " : "Illustrative model. Equilibrium price: "}<strong>{eq.price.toFixed(1)}</strong>{ka ? "; რაოდენობა: " : "; quantity: "}<strong>{eq.quantity.toFixed(1)}</strong>.</span><span>{ka ? "გადაადგილე მრუდები და შეადარე ახალი გადაკვეთის წერტილი." : "Shift the curves and compare their new intersection."}</span></>}>
    <div className="scene-canvas"><svg viewBox="0 0 640 340" role="img" aria-label={ka ? "მოთხოვნისა და მიწოდების მრუდების გადაკვეთა" : "Intersection of supply and demand curves"}>
      <defs><clipPath id={`${id}-plot`}><rect x="80" y="50" width="480" height="240" /></clipPath></defs>
      <g className="scene-grid-lines">{[25, 50, 75, 100].map((n) => <path key={n} d={`M80 ${py(n)}H560`} />)}</g>
      <path className="scene-axis" d="M80 40v250h490" />
      <g clipPath={`url(#${id}-plot)`}><path className="scene-demand" d={`M80 ${py(eq.demand)}L560 ${py(eq.demand - 80)}`} /><path className="scene-supply" d={`M80 ${py(eq.supply)}L560 ${py(eq.supply + 80)}`} /></g>
      <path className="scene-guide" d={`M80 ${y}H${x}V290`} /><circle cx={x} cy={y} r="6" fill="var(--text)" stroke="var(--bg)" strokeWidth="2" />
      <g className="scene-svg-label" fill="currentColor"><text x="51" y="46">P</text><text x="575" y="314">Q</text><text x="35" y={y + 5}>{eq.price.toFixed(0)}</text><text x={x} y="316" textAnchor="middle">{eq.quantity.toFixed(0)}</text><text x="92" y="316">0</text></g>
    </svg></div>
    <div className="scene-legend"><span className="scene-legend-demand">{ka ? "მოთხოვნა" : "Demand"}</span><span className="scene-legend-supply">{ka ? "მიწოდება" : "Supply"}</span></div>
    <div className="scene-controls"><SceneSlider label={ka ? "მოთხოვნის ცვლილება" : "Demand shift"} value={demandShift} min={-20} max={20} onChange={setDemand} /><SceneSlider label={ka ? "მიწოდების ცვლილება" : "Supply shift"} value={supplyShift} min={-10} max={20} onChange={setSupply} /></div>
  </SceneFrame>;
}

const dx = (x: number) => 320 + x * 60;
const dy = (y: number) => 278 - y * 500;
function curve(pdf: (x: number) => number, from = -4, to = 4) {
  return Array.from({ length: 161 }, (_, index) => {
    const x = from + (to - from) * index / 160;
    return `${index ? "L" : "M"}${dx(x).toFixed(2)} ${dy(pdf(x)).toFixed(2)}`;
  }).join(" ");
}

export function DistributionScene({ ka, title, student = false }: { ka: boolean; title?: string; student?: boolean }) {
  const [cutoff, setCutoff] = useState(1.96);
  const [df, setDf] = useState(5);
  const pdf = (x: number) => student ? studentTPdf(x, df) : normalPdf(x);
  const area = centralArea(cutoff, student ? df : undefined);
  const fill = `${curve(pdf, -cutoff, cutoff)}L${dx(cutoff)} 278H${dx(-cutoff)}Z`;
  return <SceneFrame title={title || (student ? (ka ? "სტიუდენტის t განაწილება" : "Student's t distribution") : (ka ? "სტანდარტული ნორმალური განაწილება" : "Standard normal distribution"))} caption={<><span>{ka ? "მონიშნული შუა არე: " : "Shaded central area: "}<strong>{(area * 100).toFixed(2)}%</strong>{` (−${cutoff} ≤ ${student ? "t" : "Z"} ≤ ${cutoff}).`}</span><span>{student ? (ka ? "წყვეტილი მრუდი სტანდარტული ნორმალურია. თავისუფლების ხარისხის ზრდით t მრუდი მას უახლოვდება." : "The dashed curve is standard normal. The t curve approaches it as degrees of freedom increase.") : (ka ? "ჰორიზონტალური ღერძი აჩვენებს საშუალოდან დაშორებას სტანდარტული გადახრებით." : "The horizontal axis measures distance from the mean in standard deviations.")}</span></>}>
    <div className="scene-canvas"><svg viewBox="0 0 640 330" role="img" aria-label={ka ? "სიმეტრიული განაწილების მრუდი მონიშნული შუა არით" : "Symmetric distribution curve with shaded central area"}>
      <g className="scene-grid-lines">{[0.1, 0.2, 0.3, 0.4].map((n) => <path key={n} d={`M80 ${dy(n)}H560`} />)}</g>
      <path className="scene-area" d={fill} />
      {student ? <path className="scene-reference" d={curve(normalPdf)} /> : null}
      <path className="scene-curve" d={curve(pdf)} /><path className="scene-axis" d="M80 278H565" />
      <path className="scene-guide" d={`M${dx(-cutoff)} 278V${dy(pdf(-cutoff))}M${dx(cutoff)} 278V${dy(pdf(cutoff))}`} />
      <g className="scene-svg-label" fill="currentColor">{[-3, -2, -1, 0, 1, 2, 3].map((n) => <text key={n} x={dx(n)} y="305" textAnchor="middle">{n}</text>)}<text x="581" y="282">{student ? "t" : "Z"}</text></g>
    </svg></div>
    <div className="scene-controls"><SceneSlider label={ka ? "ცენტრიდან დაშორება" : "Distance from center"} value={cutoff} min={0.1} max={3.5} step={0.01} onChange={setCutoff} />{student ? <SceneSlider label={ka ? "თავისუფლების ხარისხი" : "Degrees of freedom"} value={df} min={1} max={60} onChange={setDf} /> : null}</div>
  </SceneFrame>;
}

export function LineGraphScene({ ka, title, slope, intercept }: { ka: boolean; title?: string; slope: number; intercept: number }) {
  const [slopeOverride, setSlope] = useState<number | null>(null);
  const [interceptOverride, setIntercept] = useState<number | null>(null);
  const m = slopeOverride ?? slope;
  const b = interceptOverride ?? intercept;
  const id = useId().replace(/:/g, "");
  const gx = (x: number) => 320 + x * 44;
  const gy = (y: number) => 165 - y * 25;
  return <SceneFrame title={title || (ka ? "წრფის გრაფიკი" : "Line graph")} caption={`y = ${m}x ${b < 0 ? "−" : "+"} ${Math.abs(b)}`}>
    <div className="scene-canvas"><svg viewBox="0 0 640 330" role="img" aria-label={`y = ${m}x + ${b}`}>
      <defs><clipPath id={`${id}-line`}><rect x="100" y="40" width="440" height="250" /></clipPath></defs>
      <g className="scene-grid-lines">{[-4, -2, 2, 4].map((n) => <path key={n} d={`M100 ${gy(n)}H540M${gx(n)} 40V290`} />)}</g><path className="scene-axis" d="M100 165H550M320 30V290" />
      <path className="scene-curve" clipPath={`url(#${id}-line)`} d={`M${gx(-5)} ${gy(-5 * m + b)}L${gx(5)} ${gy(5 * m + b)}`} />
      <g className="scene-svg-label" fill="currentColor"><text x="555" y="183">x</text><text x="334" y="35">y</text>{[-4, -2, 0, 2, 4].map((n) => <text key={n} x={gx(n)} y="184" textAnchor="middle">{n}</text>)}</g>
    </svg></div>
    <div className="scene-controls"><SceneSlider label={ka ? "დახრილობა" : "Slope"} value={m} min={-5} max={5} step={0.1} onChange={setSlope} /><SceneSlider label={ka ? "თავისუფალი წევრი" : "Intercept"} value={b} min={-5} max={5} step={0.1} onChange={setIntercept} /></div>
  </SceneFrame>;
}
