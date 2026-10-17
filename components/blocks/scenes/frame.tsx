"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";

export function SceneFrame({ title, caption, children, actions, playing = true }: {
  title: string; caption: ReactNode; children: ReactNode; actions?: ReactNode; playing?: boolean;
}) {
  const id = useId();
  const frameRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(element);
    const onVisibility = () => setPageVisible(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return (
    <figure ref={frameRef} className="toby-scene" data-playing={playing && visible && pageVisible} aria-labelledby={id}>
      <div className="scene-heading"><span id={id} className="scene-title">{title}</span>{actions}</div>
      {children}
      <figcaption className="scene-caption">{caption}</figcaption>
    </figure>
  );
}

export function MotionToggle({ playing, onChange, ka }: { playing: boolean; onChange: (value: boolean) => void; ka: boolean }) {
  const label = playing ? (ka ? "შეჩერება" : "Pause") : (ka ? "გაგრძელება" : "Play");
  return <button className="scene-play" type="button" onClick={() => onChange(!playing)} aria-label={label} title={label} aria-pressed={!playing}>
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      {playing ? <path d="M4 3h3v10H4zM9 3h3v10H9z" /> : <path d="m5 2 9 6-9 6z" />}
    </svg>
  </button>;
}

export function SceneTabs({ labels, selected, onSelect, ka }: { labels: string[]; selected: number; onSelect: (index: number) => void; ka: boolean }) {
  return <div className="scene-tabs" role="group" aria-label={ka ? "აირჩიე ნაწილი" : "Choose a part"}>
    {labels.map((label, index) => <button key={index} type="button" aria-pressed={selected === index} onClick={() => onSelect(index)}>{label}</button>)}
  </div>;
}

export function SceneSlider({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  const id = useId();
  const progress = max > min ? `${((value - min) / (max - min)) * 100}%` : "0%";
  const rangeStyle = { "--range-progress": progress } as CSSProperties;
  return <div className="scene-slider"><label htmlFor={id}>{label}<output htmlFor={id}>{value}</output></label><input id={id} aria-label={label} type="range" min={min} max={max} step={step} value={value} style={rangeStyle} onChange={(event) => onChange(Number(event.currentTarget.value))} /></div>;
}
