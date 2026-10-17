"use client";

import { useId } from "react";
import { useChatBlockState } from "@/components/workspace/chat-block-state";
import { SceneFrame, SceneTabs, MotionToggle } from "./frame";

function Arrow({ d, color, active, marker }: { d: string; color: string; active: boolean; marker: string }) {
  return <g opacity={active ? 1 : 0.18} className="scene-flow-group">
    <path d={d} fill="none" stroke={color} strokeWidth="2" opacity="0.3" markerEnd={`url(#${marker})`} />
    <path className="scene-motion" d={d} fill="none" stroke={color} strokeWidth="3" />
  </g>;
}

export function PhotosynthesisScene({ ka, title }: { ka: boolean; title?: string }) {
  const prefix = useId().replace(/:/g, "");
  const [playing, setPlaying] = useChatBlockState("playing", true);
  const [step, setStep] = useChatBlockState("step", 0);
  const labels = ka ? ["მთლიანი პროცესი", "სინათლე", "წყალი", "CO₂", "პროდუქტები"] : ["Overview", "Light", "Water", "CO₂", "Products"];
  const descriptions = ka ? [
    "ფოთლები სინათლის ენერგიით წყლისა და CO₂-ისგან შაქრებს წარმოქმნის და ჟანგბადს გამოყოფს.",
    "ფოთლის ქლოროპლასტებში ქლოროფილი სინათლის ენერგიას შთანთქავს.",
    "ფესვებიდან წყალი ფოთლებს მიეწოდება. გამოყოფილი ჟანგბადის ატომები წყლიდან მოდის.",
    "ნახშირორჟანგი ფოთოლში ბაგეებიდან შედის; მისი ნახშირბადი შაქრების ასაგებად გამოიყენება.",
    "ფოტოსინთეზისას წარმოქმნილი შაქრები ენერგიას ინახავს და ზრდას ემსახურება; ჟანგბადი ჰაერში გამოიყოფა.",
  ] : [
    "Leaves use light energy to make sugars from water and CO₂, releasing oxygen.",
    "Chlorophyll in the leaf's chloroplasts absorbs light energy.",
    "Roots supply water to the leaves. The oxygen released comes from water molecules.",
    "CO₂ enters through leaf pores; its carbon is used to build sugars.",
    "The sugars store energy and support growth; oxygen is released into the air.",
  ];
  const active = (index: number) => step === 0 || step === index;
  const marker = `${prefix}-arrow`;
  return <SceneFrame title={title || (ka ? "ფოტოსინთეზი" : "Photosynthesis")} playing={playing} caption={descriptions[step]} actions={<MotionToggle playing={playing} onChange={setPlaying} ka={ka} />}>
    <div className="scene-canvas"><svg viewBox="0 0 640 350" role="img" aria-label={descriptions[0]}>
      <defs>
        <linearGradient id={`${prefix}-leaf`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="var(--palette-green)" /><stop offset="1" stopColor="var(--palette-mint)" /></linearGradient>
        <marker id={marker} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="m1 1 5 3-5 3" fill="none" stroke="var(--text-muted)" strokeWidth="1.2" /></marker>
      </defs>
      <ellipse cx="326" cy="306" rx="85" ry="15" fill="var(--palette-brown)" opacity="0.18" />
      <path d="M326 287c-7-64-2-126 0-194" stroke="var(--palette-green)" strokeWidth="7" strokeLinecap="round" fill="none" />
      <g fill={`url(#${prefix}-leaf)`} stroke="var(--palette-green)" strokeWidth="1">
        <path d="M327 128c-41-1-65-28-60-56 39 1 64 21 60 56Z" />
        <path d="M327 155c0-39 22-64 58-63-1 37-24 62-58 63Z" />
        <path d="M326 206c-43 1-73-21-78-55 39-4 71 15 78 55Z" />
        <path d="M326 238c5-40 36-63 75-54-8 36-37 57-75 54Z" />
      </g>
      <g stroke="var(--bg)" strokeWidth="1.3" opacity="0.55"><path d="m324 126-42-40M330 150l43-45M323 202l-59-39M331 234l54-39" /></g>
      <g fill="none" stroke="var(--palette-brown)" strokeWidth="2.5" strokeLinecap="round"><path d="m326 283-22 26-19 8m41-34 17 29 17 9m-34-38-3 36m-14-18-19 2m51 6 15-3" /></g>
      <g transform="translate(160 45)" fill="var(--palette-yellow)" stroke="var(--palette-yellow)" strokeWidth="2"><circle r="13" stroke="none" />{Array.from({ length: 8 }, (_, index) => <path key={index} d="M0-21v-6" transform={`rotate(${index * 45})`} />)}</g>
      <Arrow d="M193 63 Q223 88 264 112" color="var(--palette-yellow)" active={active(1)} marker={marker} />
      <Arrow d="M162 178 Q204 177 248 180" color="var(--palette-orange)" active={active(3)} marker={marker} />
      <Arrow d="M207 279 Q247 281 286 291" color="var(--palette-blue)" active={active(2)} marker={marker} />
      <Arrow d="M389 132 Q421 115 460 101" color="var(--palette-teal)" active={active(4)} marker={marker} />
      <Arrow d="M393 220 Q426 220 460 236" color="var(--palette-green)" active={active(4)} marker={marker} />
      <g className="scene-svg-label" fill="currentColor"><text x="75" y="95">{ka ? "მზის სინათლე" : "Sunlight"}</text><text x="28" y="168">{ka ? "ნახშირორჟანგი" : "Carbon dioxide"}</text><text x="95" y="192">CO₂</text><text x="122" y="269">{ka ? "წყალი" : "Water"}</text><text x="143" y="291">H₂O</text><text x="475" y="95">{ka ? "ჟანგბადი" : "Oxygen"}</text><text x="475" y="119">O₂</text><text x="475" y="238">{ka ? "შაქრები" : "Sugars"}</text><text x="475" y="261">{ka ? "მაგ. გლუკოზა" : "e.g. glucose"}</text></g>
    </svg></div>
    <SceneTabs labels={labels} selected={step} onSelect={setStep} ka={ka} />
  </SceneFrame>;
}

export function PlantCellScene({ ka, title }: { ka: boolean; title?: string }) {
  const [part, setPart] = useChatBlockState("part", 0);
  const labels = ka ? ["უჯრედის კედელი", "მემბრანა", "ბირთვი", "ქლოროპლასტი", "ვაკუოლი"] : ["Cell wall", "Membrane", "Nucleus", "Chloroplast", "Vacuole"];
  const descriptions = ka ? ["უჯრედის კედელი მცენარის უჯრედს სიმტკიცესა და საყრდენს აძლევს.", "მემბრანა ნივთიერებების უჯრედში შესვლასა და გამოსვლას არეგულირებს.", "ბირთვი გენეტიკური ინფორმაციის დიდ ნაწილს შეიცავს.", "ქლოროპლასტში ფოტოსინთეზი მიმდინარეობს — სინათლის ენერგიით შაქრები წარმოიქმნება.", "ცენტრალური ვაკუოლი ინახავს წყალსა და სხვა ნივთიერებებს და უჯრედის ტურგორს უწყობს ხელს."] : ["The cell wall provides strength and support.", "The membrane regulates movement into and out of the cell.", "The nucleus contains most of the cell's genetic information.", "Chloroplasts carry out photosynthesis, using light energy to make sugars.", "The central vacuole stores water and other substances and helps maintain turgor pressure."];
  return <SceneFrame title={title || (ka ? "მცენარის უჯრედი" : "Plant cell")} caption={descriptions[part]}>
    <div className="scene-canvas"><svg viewBox="0 0 640 330" role="img" aria-label={ka ? "მცენარის უჯრედის ნაწილების სქემა" : "Schematic parts of a plant cell"}>
      <rect x="121" y="27" width="398" height="275" rx="65" fill="var(--palette-green)" fillOpacity="0.1" stroke="var(--palette-green)" strokeWidth={part === 0 ? 9 : 5} />
      <rect x="134" y="40" width="372" height="249" rx="55" fill="var(--palette-mint)" fillOpacity="0.08" stroke="var(--palette-mint)" strokeWidth={part === 1 ? 5 : 1.5} />
      <path d="M272 62c-63 21-53 53-45 95s-12 85 63 101 153-9 164-69-16-118-72-128Z" fill="var(--palette-blue)" fillOpacity={part === 4 ? 0.3 : 0.13} stroke="var(--palette-blue)" strokeWidth={part === 4 ? 4 : 1.5} />
      <ellipse cx="190" cy="186" rx="34" ry="40" fill="var(--palette-purple)" fillOpacity="0.3" stroke="var(--palette-purple)" strokeWidth={part === 2 ? 4 : 1.5} /><circle cx="193" cy="186" r="12" fill="var(--palette-purple)" fillOpacity="0.65" />
      {[[184, 92, -25], [445, 90, 28], [459, 239, -35], [193, 258, 20]].map(([x, y, angle], index) => <g key={index} transform={`translate(${x} ${y}) rotate(${angle})`}><ellipse rx="28" ry="14" fill="var(--palette-green)" fillOpacity="0.4" stroke="var(--palette-green)" strokeWidth={part === 3 ? 4 : 1.5} /><path d="M-15-6v12M-5-8v16M5-8v16M15-6v12" stroke="var(--palette-green)" strokeWidth="2" /></g>)}
      {[[121, 70], [141, 132], [173, 178], [443, 90], [340, 165]].map(([x, y], index) => <g key={index} className="scene-cell-number"><circle cx={x} cy={y} r="13" fill="var(--bg)" stroke={part === index ? "var(--text)" : "var(--panel-border)"} /><text x={x} y={y + 5} textAnchor="middle" fill="currentColor">{index + 1}</text></g>)}
    </svg></div>
    <SceneTabs labels={labels.map((label, index) => `${index + 1}. ${label}`)} selected={part} onSelect={setPart} ka={ka} />
  </SceneFrame>;
}
