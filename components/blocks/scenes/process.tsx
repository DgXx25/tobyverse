"use client";

import { useId } from "react";
import { useChatBlockState } from "@/components/workspace/chat-block-state";
import { SceneFrame, SceneTabs, MotionToggle } from "./frame";
import type { SceneBlock } from "@/lib/blocks/kinds/scene";

type DiagramBlock = Extract<SceneBlock, { id: "process" | "cycle" | "structure" }>;

function shortLabel(label: string, width = 17): string[] {
  const words = label.split(/\s+/);
  const lines = [""];
  for (const word of words) {
    const last = lines.length - 1;
    if (lines[last].length + word.length > width && lines[last]) lines.push(word);
    else lines[last] += `${lines[last] ? " " : ""}${word}`;
  }
  return lines.slice(0, 2).map((line) => line.length > width + 2 ? `${line.slice(0, width + 1)}…` : line);
}

export function ProcessScene({ block }: { block: DiagramBlock }) {
  const ka = block.locale === "ka";
  const [selected, setSelected] = useChatBlockState("selected", 0);
  const [playing, setPlaying] = useChatBlockState("playing", true);
  const marker = useId().replace(/:/g, "");
  const items = block.id === "structure" ? block.parts : block.steps;
  const active = Math.min(selected, items.length - 1);
  const radial = block.id !== "process";
  const points = items.map((_, index) => radial
    ? { x: 320 + Math.cos(index * Math.PI * 2 / items.length - Math.PI / 2) * 205, y: 180 + Math.sin(index * Math.PI * 2 / items.length - Math.PI / 2) * 110 }
    : { x: 90, y: 40 + index * 70 });
  const title = block.title || (block.id === "structure" ? block.center : block.id === "cycle" ? (ka ? "ციკლი" : "Cycle") : (ka ? "პროცესი" : "Process"));
  return <SceneFrame title={title} playing={playing} caption={<><strong>{items[active].label}</strong>{items[active].detail ? <span>{items[active].detail}</span> : null}</>} actions={block.id === "structure" ? undefined : <MotionToggle playing={playing} onChange={setPlaying} ka={ka} />}>
    <div className="scene-canvas"><svg viewBox={`0 0 640 ${radial ? 380 : items.length * 70 + 5}`} role="img" aria-label={items.map((item) => item.label).join(block.id === "structure" ? ", " : " → ")}>
      <defs><marker id={marker} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="m1 1 5 2.5-5 2.5" fill="none" stroke="var(--scene-accent)" /></marker></defs>
      {points.map((point, index) => {
        const next = block.id === "structure" ? { x: 320, y: 180 } : points[(index + 1) % points.length];
        if (block.id === "process" && index === points.length - 1) return null;
        const angle = Math.atan2(next.y - point.y, next.x - point.x);
        const d = `M${point.x + Math.cos(angle) * 25} ${point.y + Math.sin(angle) * 25}L${next.x - Math.cos(angle) * 30} ${next.y - Math.sin(angle) * 30}`;
        return <g key={index}><path d={d} className="scene-connection" markerEnd={block.id === "structure" ? undefined : `url(#${marker})`} />{block.id !== "structure" ? <path d={d} className="scene-motion scene-connection-motion" /> : null}</g>;
      })}
      {block.id === "structure" ? <g><rect x="240" y="150" width="160" height="60" rx="14" className="scene-node" />{shortLabel(block.center).map((line, index) => <text className="scene-svg-label" key={index} x="320" y={176 + index * 20} textAnchor="middle" fill="currentColor">{line}</text>)}</g> : null}
      {points.map((point, index) => <g key={index} opacity={active === index ? 1 : 0.65}>
        <circle cx={point.x} cy={point.y} r="21" className="scene-node" /><text x={point.x} y={point.y + 5} className="scene-svg-label" textAnchor="middle" fill="currentColor">{index + 1}</text>
        {shortLabel(items[index].label, radial ? 17 : 39).map((line, row) => <text key={row} x={radial ? point.x : 130} y={point.y + (radial ? 42 : 5) + row * 22} className="scene-svg-label" textAnchor={radial ? "middle" : "start"} fill="currentColor">{line}</text>)}
      </g>)}
    </svg></div>
    <SceneTabs labels={items.map((item) => item.label)} selected={active} onSelect={setSelected} ka={ka} />
  </SceneFrame>;
}
