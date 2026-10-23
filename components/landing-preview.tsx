"use client";

import { useCallback, useEffect, useRef, useState, type TouchEvent } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowDown, ArrowRight, Pause, Play } from "lucide-react";
import styles from "./landing-preview.module.css";

const LandingParticles = dynamic(
  () => import("./landing-particles").then((mod) => mod.LandingParticles),
  { ssr: false },
);

// Reserved for the landing once multi-provider model choice ships.
export const FUTURE_MODELS_CHAPTER = {
  id: "models",
  label: "AI მოდელები",
  title: ["შეარჩიე მოდელი", "შენი ამოცანისთვის."],
  description: "ამჟამად TobyVerse იყენებს Gemini-ის მოდელებს; მომავალში Grok-ისა და სხვა მოდელების არჩევანიც დაემატება.",
} as const;

const CHAPTERS = [
  { id: "intro", letter: "A", label: "დასაწყისი", title: ["ატვირთე და დაიწყე.", "ისწავლე ერთ სივრცეში."], description: "TobyVerse აერთიანებს შენს ფაილებს, AI ჩატსა და სასწავლო ხელსაწყოებს. დასვი კითხვა, გადაამოწმე წყარო და იმავე პროექტში შექმენი კონსპექტი, ბარათები ან ქვიზი.", duration: 10000 },
  { id: "materials", letter: "B", label: "მასალები", title: ["ატვირთე თავისუფლად.", "გეგმის მიხედვით მეტი საცავით."], description: "უფასო გეგმა გაძლევს 300 MB საცავს. ფასიან გეგმებში ლიმიტი იზრდება — ფოტოები, PDF-ები და დოკუმენტები ერთ საერთო საცავში ინახება.", duration: 11000 },
  { id: "answers", letter: "C", label: "პასუხები", title: ["მიიღე ახსნა,", "რომელიც გესმის."], description: "TobyVerse პასუხს შენს კითხვას არგებს — მოკლედ, ნაბიჯ-ნაბიჯ, მაგალითით თუ დიაგრამით. ასე მხოლოდ პასუხს კი არ იღებ, საკითხსაც უკეთ იაზრებ.", duration: 10000 },
  { id: "speed", letter: "D", label: "სიჩქარე", title: ["დაიწყე კითხვა.", "პასუხი უკვე მოდის."], description: "TobyVerse პასუხს გამოჩენისთანავე გაჩვენებს, სანამ გენერაცია გრძელდება — შეგიძლია კითხვა კვალდაკვალ წაიკითხო და ფიქრი არ შეწყვიტო.", duration: 10000 },
  { id: "create", letter: "E", label: "შექმნა", title: ["გადააქციე პასუხი", "სასწავლო მასალად."], description: "კონსპექტი, ბარათები, ქვიზი, ცხრილი ან სასწავლო გზა — შექმენი იმავე პროექტში, იმავე წყაროებზე დაყრდნობით.", duration: 10000 },
  { id: "start", letter: "F", label: "დაწყება", title: ["ატვირთე მასალა.", "დაიწყე კითხვით."], description: "ატვირთე ფაილი, დასვი კითხვა და მიიღე წყაროიანი პასუხი — შემდეგ მასალა კონსპექტად ან სავარჯიშოდ აქციე.", duration: 10000 },
] as const;

function SceneDetails({ index }: { index: number }) {
  if (index === 1) return <div className={styles.coordinates} aria-hidden="true"><span className={styles.coordinateOne}>PDF / 24 გვერდი</span><span className={styles.coordinateTwo}>სლაიდები / ჩანაწერები</span><span className={styles.coordinateThree}>წყარო პასუხის გვერდით</span></div>;
  if (index === 2) return <div className={styles.responseModes} aria-hidden="true"><span>მოკლე პასუხი</span><span>ნაბიჯებად</span><span>დიაგრამით</span><span>მაგალითით</span></div>;
  if (index === 4) return <div className={styles.markNames} aria-hidden="true"><span>კონსპექტი</span><span>ბარათები</span><span>ქვიზი</span><span>ცხრილი</span></div>;
  return null;
}

export function LandingPreview() {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [particlesReady, setParticlesReady] = useState(false);
  const [sceneEntering, setSceneEntering] = useState(false);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [direction, setDirection] = useState(1);
  const rootRef = useRef<HTMLElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);
  const elapsedRef = useRef(0);
  const transitionUntil = useRef(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const chapter = CHAPTERS[active];

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setParticlesReady(true), 700);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!sceneEntering) return;
    const timer = window.setTimeout(() => setSceneEntering(false), 520);
    return () => window.clearTimeout(timer);
  }, [sceneEntering, active]);

  const goTo = useCallback((next: number, manual = true) => {
    const bounded = Math.max(0, Math.min(CHAPTERS.length - 1, next));
    if (manual) setPlaying(false);
    if (bounded === indexRef.current) return;
    setDirection(bounded > indexRef.current ? 1 : -1);
    indexRef.current = bounded;
    elapsedRef.current = 0;
    setSceneEntering(true);
    transitionUntil.current = performance.now() + 1100;
    setActive(bounded);
    if (typeof window !== "undefined") window.history.replaceState(null, "", `#${CHAPTERS[bounded].id}`);
  }, []);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const initial = CHAPTERS.findIndex((item) => item.id === hash);
    if (initial > 0) goTo(initial, false);
    setPlaying(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, [goTo]);

  useEffect(() => {
    if (!playing) return;
    let animation = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = Math.min(now - last, 80);
      last = now;
      if (!document.hidden) elapsedRef.current += delta;
      const progress = Math.min(elapsedRef.current / CHAPTERS[indexRef.current].duration, 1);
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${progress})`;
      if (progress === 1) {
        if (indexRef.current === CHAPTERS.length - 1) { setPlaying(false); return; }
        goTo(indexRef.current + 1, false);
      }
      animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [playing, goTo]);

  useEffect(() => {
    if (progressRef.current) progressRef.current.style.transform = "scaleX(0)";
  }, [active]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let wheelAmount = 0;
    let wheelTime = 0;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      event.preventDefault();
      const now = performance.now();
      if (now < transitionUntil.current) return;
      if (now - wheelTime > 160) wheelAmount = 0;
      wheelTime = now;
      wheelAmount += event.deltaY;
      if (Math.abs(wheelAmount) < 45) return;
      goTo(indexRef.current + Math.sign(wheelAmount));
      transitionUntil.current = now + 1100;
      wheelAmount = 0;
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable='true']") || event.repeat) return;
      if (["ArrowDown", "ArrowRight", "PageDown"].includes(event.key)) { event.preventDefault(); goTo(indexRef.current + 1); }
      if (["ArrowUp", "ArrowLeft", "PageUp"].includes(event.key)) { event.preventDefault(); goTo(indexRef.current - 1); }
      if (event.key === "Home") { event.preventDefault(); goTo(0); }
      if (event.key === "End") { event.preventDefault(); goTo(CHAPTERS.length - 1); }
      if (event.code === "Space" && !target.closest("button, a")) { event.preventDefault(); setPlaying((value) => !value); }
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => { root.removeEventListener("wheel", onWheel); window.removeEventListener("keydown", onKey); };
  }, [goTo]);

  const onTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const deltaY = start.y - event.changedTouches[0].clientY;
    const deltaX = start.x - event.changedTouches[0].clientX;
    if (Math.max(Math.abs(deltaY), Math.abs(deltaX)) < 50) return;
    if (performance.now() < transitionUntil.current) return;
    goTo(indexRef.current + Math.sign(Math.abs(deltaY) > Math.abs(deltaX) ? deltaY : deltaX));
  };

  return (
    <main ref={rootRef} className={styles.experience} data-scene={chapter.id} onTouchStart={(event) => { touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }} onTouchEnd={onTouchEnd} aria-label="TobyVerse-ის შესაძლებლობები" aria-roledescription="carousel" lang="ka">
      {particlesReady ? <LandingParticles scene={active} reducedMotion={reducedMotion} /> : null}
      <div className={styles.vignette} aria-hidden="true" />

      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="TobyVerse მთავარი გვერდი"><span className={styles.brandMark} aria-hidden="true" /><span>TobyVerse</span></Link>
        <nav className={styles.chapters} aria-label="სცენები">
          <svg className={styles.chapterThread} viewBox="0 0 340 34" preserveAspectRatio="none" aria-hidden="true"><path d="M17 17 H323" /></svg>
          {CHAPTERS.map((item, index) => <button key={item.id} type="button" className={styles.chapterButton} data-active={active === index} data-visited={index < active} aria-label={item.label} aria-current={active === index ? "step" : undefined} onClick={() => goTo(index)}><span>{item.letter}</span><small>{item.label}</small></button>)}
        </nav>
        <Link href="/login" className={styles.headerLogin}>შესვლა <ArrowRight size={13} /></Link>
      </header>

      <section
        key={chapter.id}
        className={`${styles.scene} ${active === 0 ? styles.intro : active === 5 ? styles.final : styles.editorial}`}
        data-entering={sceneEntering && !reducedMotion ? "true" : undefined}
        data-direction={direction}
        aria-label={`${active + 1} / ${CHAPTERS.length}: ${chapter.label}`}
      >
          <SceneDetails index={active} />
          <div className={styles.sceneCopy}>
            {active === 0 ? <h1>{chapter.title.map((line) => <span key={line}>{line}</span>)}</h1> : <h2>{chapter.title.map((line) => <span key={line}>{line}</span>)}</h2>}
            <p>{chapter.description}</p>
            {active === 0 && <button className={styles.quietCta} type="button" onClick={() => goTo(1)}>შეაბიჯე TobyVerse-ში <ArrowDown size={14} /></button>}
            {active === 5 && <Link className={styles.mainCta} href="/login"><span className={styles.ctaOrbit} aria-hidden="true"><i /><i /><i /></span>გახსენი TobyVerse <ArrowRight size={15} /></Link>}
          </div>
      </section>

      <footer className={styles.footer}>
        <button type="button" className={styles.playButton} onClick={() => { if (!playing && active === CHAPTERS.length - 1) goTo(0, false); setPlaying((value) => !value); }} aria-label={playing ? "ავტომატური გადასვლის შეჩერება" : "ავტომატური გადასვლის დაწყება"} aria-pressed={playing}>{playing ? <Pause size={13} /> : <Play size={13} />}</button>
      </footer>
      <nav className={styles.legalLinks} aria-label="Legal">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/refunds">Refunds</Link>
        <Link href="/pricing">Pricing</Link>
      </nav>
      <div className={styles.progressTrack} aria-hidden="true"><div ref={progressRef} /></div>
    </main>
  );
}
