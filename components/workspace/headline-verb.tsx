"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const VERBS = ["learn", "explore", "do", "practice", "note", "study", "plan", "make"] as const;
const HOLD_MS = 2800;
const SLIDE_MS = 500;

export function HeadlineVerb() {
  const slide = [...VERBS, VERBS[0]];
  const [index, setIndex] = useState(0);
  const [widths, setWidths] = useState<number[]>([]);
  const [instant, setInstant] = useState(false);
  const [reduced, setReduced] = useState(false);
  const measureRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const measure = () => {
    setWidths(measureRefs.current.map((node) => Math.ceil(node?.scrollWidth ?? 0)));
  };

  useLayoutEffect(() => {
    measure();
  }, [index]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(media.matches);
    const onChange = () => setReduced(media.matches);
    media.addEventListener("change", onChange);
    window.addEventListener("resize", measure);
    const fonts = document.fonts;
    void fonts?.ready.then(measure);
    return () => {
      media.removeEventListener("change", onChange);
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    if (reduced) return;
    if (index === VERBS.length) {
      const snap = window.setTimeout(() => {
        setInstant(true);
        setIndex(0);
      }, SLIDE_MS);
      return () => window.clearTimeout(snap);
    }
    const hold = window.setTimeout(() => {
      setInstant(false);
      setIndex((current) => current + 1);
    }, HOLD_MS);
    return () => window.clearTimeout(hold);
  }, [index, reduced]);

  const width = widths[index % VERBS.length] ?? 0;

  if (reduced) return <span className="headline-verb-word">learn</span>;

  return (
    <span className="headline-verb-slot">
      <span className="headline-verb-measure" aria-hidden>
        {VERBS.map((word, i) => (
          <span
            key={word}
            ref={(node) => {
              measureRefs.current[i] = node;
            }}
            className="headline-verb-word"
          >
            {word}
          </span>
        ))}
      </span>
      <span
        className={`headline-verb${instant ? " is-instant" : ""}`}
        style={width > 0 ? { width } : undefined}
      >
        <span
          className="headline-verb-track"
          style={{ transform: `translate3d(0, ${-index * 1.2}em, 0)` }}
        >
          {slide.map((word, i) => (
            <span key={`${word}-${i}`} className="headline-verb-word">
              {word}
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}
