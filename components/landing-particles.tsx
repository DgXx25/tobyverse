"use client";

import { useEffect, useRef } from "react";
import {
  COMPACT_CREATION_LAYOUT,
  CREATION_LAYOUT,
  CREATION_MARKS,
  type ParticleMark,
  type ParticleMarkPlacement,
} from "./landing-particle-marks";

const TAU = Math.PI * 2;
// The happy expression from /toby1.svg, also used beside the login headline.
const HAPPY_TOBY_PATH = "m136.1,14c-13.8,1.3-18.7,16.3-36.1,16.3s-22.3-15-36.1-16.3C39.4,11.6,2.7,54,3.8,96.9c1.2,45.5,44.8,89.1,96.2,89.1s95-43.7,96.2-89.1c1.1-42.9-35.5-85.3-60.1-82.9ZM49.4,109.3v-21.6c0-9.6,7.8-17.5,17.5-17.5s17.5,7.8,17.5,17.5v21.6c-4.4-1.1-10.1-2-16.9-2.1-7.3,0-13.4,1-18.1,2.1Zm62.2,29.2c-4.8,0-9-2.3-11.7-5.8-2.7,3.5-6.9,5.8-11.7,5.8-8.1,0-14.7-6.6-14.7-14.7s1.3-3,3-3,3,1.3,3,3c0,4.8,3.9,8.7,8.7,8.7s8.7-3.9,8.7-8.7,1.3-3,3-3,3,1.3,3,3c0,4.8,3.9,8.7,8.7,8.7s8.7-3.9,8.7-8.7,1.3-3,3-3,3,1.3,3,3c0,8.1-6.6,14.7-14.7,14.7Zm38.9-29.2c-4.3-1.2-10.3-2.3-17.5-2.3-7.1,0-13.1,1.2-17.4,2.3v-21.6c0-9.6,7.8-17.5,17.5-17.5s17.5,7.8,17.5,17.5v21.6Z";

function randomGenerator(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function makeMarkSampler(mark: ParticleMark, context: CanvasRenderingContext2D) {
  const path = new Path2D(mark.path);
  let fallback: [number, number] = [0, 0];
  findFallback: for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const px = (x + .5) / 32 * mark.size;
      const py = (y + .5) / 32 * mark.size;
      if (!context.isPointInPath(path, px, py, mark.fillRule)) continue;
      fallback = [px / mark.size - .5, py / mark.size - .5];
      break findFallback;
    }
  }
  return (random: () => number): [number, number] => {
    for (let attempt = 0; attempt < 256; attempt++) {
      const x = random() * mark.size;
      const y = random() * mark.size;
      if (context.isPointInPath(path, x, y, mark.fillRule)) return [x / mark.size - .5, y / mark.size - .5];
    }
    return fallback;
  };
}

function placeMark(buffer: Float32Array, offset: number, point: [number, number], placement: ParticleMarkPlacement, depth: number) {
  buffer[offset] = placement.x + point[0] * placement.size;
  buffer[offset + 1] = placement.y + point[1] * placement.size;
  buffer[offset + 2] = depth;
}

function makeShapes(count: number, context: CanvasRenderingContext2D) {
  // Sampling uses SVG coordinates, independently of the display canvas's DPR.
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  const random = randomGenerator(18263);
  const shapes = Array.from({ length: 6 }, () => new Float32Array(count * 3));
  const compactShapes = [...shapes];
  compactShapes[3] = new Float32Array(count * 3);
  compactShapes[4] = new Float32Array(count * 3);
  const creationSamplers = CREATION_MARKS.map((mark) => makeMarkSampler(mark, context));
  const path = new Path2D(HAPPY_TOBY_PATH);
  for (let i = 0; i < count; i++) {
    const u = random();
    const v = random();
    const w = random();
    const offset = i * 3;
    const phi = v * TAU;
    const theta = Math.acos(u * 2 - 1);
    const radius = 1.42 + Math.sin(phi * 5 + theta * 8) * .07 + (w - .5) * .08;
    shapes[0][offset] = Math.sin(theta) * Math.cos(phi) * radius;
    shapes[0][offset + 1] = Math.cos(theta) * radius;
    shapes[0][offset + 2] = Math.sin(theta) * Math.sin(phi) * radius;

    const sheet = i % 3;
    const edge = w < .32;
    let sx = (u - .5) * 1.3;
    let sy = (v - .5) * 1.85;
    if (edge) { if (v < .5) sx = Math.sign(sx) * .65; else sy = Math.sign(sy) * .925; }
    else if (w < .68) { sy = Math.round(sy * 9) / 9; sx *= .72; }
    const angle = -.25 + sheet * .18;
    shapes[1][offset] = sx * Math.cos(angle) - sy * Math.sin(angle) + (sheet - 1) * .6;
    shapes[1][offset + 1] = sx * Math.sin(angle) + sy * Math.cos(angle) + (sheet - 1) * .16;
    shapes[1][offset + 2] = (sheet - 1) * .5 + (w - .5) * .04;

    const streamX = (u - .5) * 7;
    const tubeRadius = .15 + Math.pow(Math.abs(streamX) / 3.5, 1.45) * .62;
    const twist = phi + streamX * 1.7;
    shapes[2][offset] = streamX;
    shapes[2][offset + 1] = Math.sin(twist) * tubeRadius + Math.sin(streamX * 1.2) * .17;
    shapes[2][offset + 2] = Math.cos(twist) * tubeRadius;

    const waveX = (u - .5) * 8;
    const wavePhase = waveX * 1.75 + phi * .28;
    const waveAmplitude = .38 + w * .34;
    shapes[3][offset] = waveX;
    shapes[3][offset + 1] = Math.sin(wavePhase) * waveAmplitude + Math.sin(waveX * .62) * .18;
    shapes[3][offset + 2] = Math.cos(wavePhase) * .27 + (v - .5) * .12;
    compactShapes[3][offset] = waveX * .58;
    compactShapes[3][offset + 1] = shapes[3][offset + 1] * .72;
    compactShapes[3][offset + 2] = shapes[3][offset + 2] * .72;

    const output = i % 4;
    const creationPoint = creationSamplers[output](random);
    placeMark(shapes[4], offset, creationPoint, CREATION_LAYOUT[output], (w - .5) * .045);
    placeMark(compactShapes[4], offset, creationPoint, COMPACT_CREATION_LAYOUT[output], (w - .5) * .02);

    let lx = random() * 200;
    let ly = random() * 200;
    let attempts = 0;
    while (!context.isPointInPath(path, lx, ly) && attempts++ < 80) { lx = random() * 200; ly = random() * 200; }
    shapes[5][offset] = (lx - 100) / 82;
    shapes[5][offset + 1] = (ly - 100) / 82;
    shapes[5][offset + 2] = (w - .5) * .22;
  }
  context.restore();
  return { shapes, compactShapes };
}

export function LandingParticles({ scene, reducedMotion }: { scene: number; reducedMotion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef(scene);
  const redrawRef = useRef<(() => void) | null>(null);
  useEffect(() => { sceneRef.current = scene; redrawRef.current?.(); }, [scene]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: false });
    if (!canvas || !context) return;
    const mobile = window.innerWidth < 621;
    const count = mobile ? 4800 : 16000;
    const { shapes, compactShapes } = makeShapes(count, context);
    const current = new Float32Array((mobile ? compactShapes : shapes)[sceneRef.current]);
    const random = randomGenerator(8473);
    const stars = Array.from({ length: 160 }, () => [random(), random(), random()]);
    let width = 0;
    let height = 0;
    let animation = 0;
    let last = performance.now();
    let time = 0;
    let pointerX = 0;
    let pointerY = 0;
    let mouseX = 0;
    let mouseY = 0;
    let paused = document.hidden;
    let currentCenterX = .5;
    let currentCenterY = .46;
    let currentScale = 1;
    let currentBaseScale = 0;
    let labelLayoutKey = "";
    let backdrop: CanvasGradient | null = null;
    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      backdrop = context.createRadialGradient(width * .57, height * .38, 0, width * .57, height * .38, Math.max(width, height) * .62);
      backdrop.addColorStop(0, "#070707");
      backdrop.addColorStop(.45, "#030303");
      backdrop.addColorStop(1, "#000000");
      if (reducedMotion) draw(performance.now());
    };
    const pointer = (event: PointerEvent) => { pointerX = (event.clientX / width - .5) * .2; pointerY = (event.clientY / height - .5) * .12; };
    const visibility = () => { paused = document.hidden; last = performance.now(); };
    const draw = (now: number) => {
      const delta = Math.min((now - last) / 16.667, 2);
      last = now;
      if (!paused) {
        if (!reducedMotion) time += delta * .007;
        const active = sceneRef.current;
        const small = width < 621;
        const iconScene = active === 4;
        const centerX = active === 0 || active === 5 || small ? .5 : active === 2 ? .53 : iconScene ? .63 : .66;
        const centerY = active === 5 ? (small ? .32 : .28) : active === 0 ? .45 : active === 3 || small ? .36 : active === 4 ? .37 : .40;
        const shapeScale = active === 5 ? .58 : active === 0 ? 1.06 : active === 2 ? .91 : .94;
        const lerp = reducedMotion ? 1 : 1 - Math.pow(.945, delta);
        currentCenterX += (centerX - currentCenterX) * lerp;
        currentCenterY += (centerY - currentCenterY) * lerp;
        currentScale += (shapeScale - currentScale) * lerp;
        mouseX += (pointerX - mouseX) * .025;
        mouseY += (pointerY - mouseY) * .025;
        context.fillStyle = backdrop ?? "#000000";
        context.fillRect(0, 0, width, height);
        context.fillStyle = "#8e8e93";
        for (const star of stars) {
          context.globalAlpha = .10 + star[2] * .2;
          context.fillRect(star[0] * width, star[1] * height, star[2] > .9 ? 1.5 : .7, star[2] > .9 ? 1.5 : .7);
        }
        const baseScale = Math.min(width * (active === 3 ? small ? .17 : .075 : small ? .77 : iconScene ? .23 : .47), height * .36);
        if (!currentBaseScale) currentBaseScale = baseScale;
        currentBaseScale += (baseScale - currentBaseScale) * lerp;
        const scale = currentBaseScale * currentScale;
        const layoutKey = `${active}:${width}:${height}`;
        if (iconScene && labelLayoutKey !== layoutKey) {
          const layout = small ? COMPACT_CREATION_LAYOUT : CREATION_LAYOUT;
          const targetScale = baseScale * shapeScale;
          layout.forEach((mark, index) => {
            canvas.parentElement?.style.setProperty(`--mark-${index}-x`, `${width * centerX + mark.x * targetScale}px`);
            canvas.parentElement?.style.setProperty(`--mark-${index}-y`, `${height * centerY + (mark.y + mark.size * .4) * targetScale + 12}px`);
          });
          labelLayoutKey = layoutKey;
        }
        const rotateY = active >= 3 ? mouseX * .35 : Math.sin(time * .25) * .13 + mouseX;
        const cosine = Math.cos(rotateY);
        const sine = Math.sin(rotateY);
        const target = (small ? compactShapes : shapes)[active];
        for (let i = 0; i < count; i++) {
          const offset = i * 3;
          current[offset] += (target[offset] - current[offset]) * lerp;
          current[offset + 1] += (target[offset + 1] - current[offset + 1]) * lerp;
          current[offset + 2] += (target[offset + 2] - current[offset + 2]) * lerp;
          const drift = reducedMotion ? 0 : Math.sin(time * 1.7 + i * .013) * .016;
          const x = current[offset] + drift;
          const waveFlow = active === 3 && !reducedMotion ? Math.sin(time * 1.25 + current[offset] * 1.8) * .13 : 0;
          const y = current[offset + 1] + waveFlow + Math.sin(time + i * .017) * (reducedMotion ? 0 : .012);
          const z = current[offset + 2];
          const rx = x * cosine - z * sine;
          const rz = x * sine + z * cosine;
          const perspective = 4.8 / (4.8 + rz);
          const px = width * currentCenterX + rx * scale * perspective;
          const py = height * currentCenterY + (y + mouseY * .4) * scale * perspective;
          const depth = Math.max(.12, Math.min(1, (1.8 - rz) / 3));
          context.globalAlpha = (i % 7 === 0 ? .9 : iconScene ? .8 : .58) * depth;
          context.fillStyle = i % 9 === 0 ? "#0091ff" : "#ececec";
          const size = (i % 11 === 0 ? 1.65 : 1.02) * perspective * (small ? .9 : 1);
          context.fillRect(px, py, size, size);
        }
        context.globalAlpha = 1;
      }
      if (!reducedMotion) animation = requestAnimationFrame(draw);
    };
    redrawRef.current = reducedMotion ? () => draw(performance.now()) : null;
    resize();
    if (!reducedMotion) animation = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", pointer, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    return () => { cancelAnimationFrame(animation); redrawRef.current = null; window.removeEventListener("resize", resize); window.removeEventListener("pointermove", pointer); document.removeEventListener("visibilitychange", visibility); };
  }, [reducedMotion]);

  return <canvas ref={canvasRef} aria-hidden="true" />;
}
