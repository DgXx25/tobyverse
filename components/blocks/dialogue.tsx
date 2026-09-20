"use client";

import { MixedText } from "@/components/visuals/mixed-text";
import type { DialogueBlock } from "@/lib/blocks/kinds/dialogue";

const FACES = ["👦", "👧", "👨", "👩", "🧒", "👴", "👵", "🐶", "🐱", "🦊", "🦉", "🐻", "🐼", "🐸", "🐰"];

function faceIndex(id: string): number {
  let n = 0;
  for (let i = 0; i < id.length; i += 1) n = (n * 31 + id.charCodeAt(i)) >>> 0;
  return n % FACES.length;
}

function faceFor(block: DialogueBlock, speakerId: string): string {
  const assigned = new Map<string, string>();
  for (const speaker of block.speakers) {
    const custom = speaker.emoji?.trim();
    if (custom) assigned.set(speaker.id, custom);
  }
  for (const speaker of block.speakers) {
    if (assigned.has(speaker.id)) continue;
    const taken = new Set(assigned.values());
    const at = faceIndex(speaker.id);
    let face = FACES[at];
    for (let step = 0; step < FACES.length; step += 1) {
      const next = FACES[(at + step) % FACES.length];
      if (!taken.has(next)) {
        face = next;
        break;
      }
    }
    assigned.set(speaker.id, face);
  }
  return assigned.get(speakerId) ?? FACES[0];
}

function applyMark(text: string, mark?: string): string {
  const needle = mark?.trim();
  if (!needle) return text;
  if (text.includes(`==${needle}==`)) return text;
  const hit = findMark(text, needle);
  if (!hit) return text;
  return `${text.slice(0, hit.at)}==${text.slice(hit.at, hit.at + hit.len)}==${text.slice(hit.at + hit.len)}`;
}

function findMark(text: string, needle: string): { at: number; len: number } | null {
  const lower = text.toLowerCase();
  const at = lower.indexOf(needle.toLowerCase());
  if (at >= 0) return { at, len: needle.length };
  const contracted = needle.replace(/^will\s+/i, "'ll ");
  if (contracted === needle) return null;
  const from = lower.indexOf(contracted.toLowerCase());
  if (from < 0) return null;
  return { at: from, len: contracted.length };
}

function labelFor(block: DialogueBlock, speakerId: string): string {
  const speaker = block.speakers.find((item) => item.id === speakerId);
  return speaker?.name?.trim() || speaker?.emoji?.trim() || speakerId;
}

export function DialogueView({ block, streaming = false }: { block: DialogueBlock; streaming?: boolean }) {
  const caption = block.note?.trim() || block.title?.trim();
  return (
    <div className="toby-dialogue">
      <ol className="toby-dialogue-path">
        {block.lines.map((line, index) => {
          const last = index === block.lines.length - 1;
          const face = faceFor(block, line.speaker);
          return (
            <li key={index} className="toby-dialogue-step">
              <div className="toby-dialogue-rail" aria-hidden="true">
                <span className="toby-dialogue-face">{face}</span>
                {last ? null : <span className="toby-dialogue-line" />}
              </div>
              <div className="toby-dialogue-copy">
                <p className="toby-dialogue-text">
                  <span className="sr-only">{labelFor(block, line.speaker)}: </span>
                  <MixedText text={applyMark(line.text, block.mark)} streaming={streaming && last} />
                </p>
                {line.gloss?.trim() ? <p className="toby-dialogue-gloss">{line.gloss.trim()}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
      {caption ? <p className="toby-dialogue-note">{caption}</p> : null}
    </div>
  );
}
