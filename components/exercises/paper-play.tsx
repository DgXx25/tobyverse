"use client";

import { useEffect, useRef, useState } from "react";
import { StreamWords } from "@/components/workspace/stream-text";
import { paperFormTitle } from "@/lib/exercises/forms";
import type { PaperPayload } from "@/types/exercise";

export type PaperAnswer = {
  to: string;
  body: string;
  sign: string;
  date: string;
};

function GrowField({
  value,
  onChange,
  placeholder,
  locked,
  align = "left",
  multiline = false,
  ariaLabel,
  streaming = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  locked?: boolean;
  align?: "left" | "right" | "center";
  multiline?: boolean;
  ariaLabel: string;
  streaming?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(el.scrollHeight, multiline ? 72 : 28)}px`;
  }, [value, multiline]);

  const className = `ex-paper-field ${multiline ? "is-body" : ""} ${align === "right" ? "is-right" : ""}`;
  if (streaming && locked) {
    return (
      <div className={className} aria-label={ariaLabel}>
        {value ? <StreamWords text={value} /> : <span className="ex-paper-placeholder">{placeholder}</span>}
      </div>
    );
  }

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      readOnly={locked}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
      className={className}
    />
  );
}

export function paperIsExample(data: PaperPayload): boolean {
  if (/^მაგალითი\b/i.test(data.brief.trim())) return true;
  const sample = data.sample;
  return Boolean(sample && (sample.body?.trim() || sample.to?.trim() || sample.sign?.trim() || sample.date?.trim()));
}

export function PaperPlay({
  data,
  locked,
  onSelect,
  streaming = false,
}: {
  data: PaperPayload;
  locked?: boolean;
  onSelect: (value: PaperAnswer) => void;
  streaming?: boolean;
}) {
  const example = paperIsExample(data);
  const frozen = Boolean(locked || example);
  const sampleTo = example ? (data.sample?.to ?? data.given?.to ?? "") : "";
  const sampleBody = example ? (data.sample?.body ?? "") : "";
  const sampleSign = example ? (data.sample?.sign ?? "") : "";
  const sampleDate = example ? (data.sample?.date ?? "") : "";
  const [to, setTo] = useState(data.given?.to ?? "");
  const [body, setBody] = useState("");
  const [sign, setSign] = useState("");
  const [date, setDate] = useState("");
  const liveTo = example ? sampleTo : to;
  const liveBody = example ? sampleBody : body;
  const liveSign = example ? sampleSign : sign;
  const liveDate = example ? sampleDate : date;
  const streamFields = Boolean(streaming && example);

  useEffect(() => {
    if (example || !streaming) return;
    if (data.given?.to) setTo(data.given.to);
  }, [example, streaming, data.given?.to]);

  function emit(next: Partial<PaperAnswer>) {
    const answer: PaperAnswer = {
      to,
      body,
      sign,
      date,
      ...next,
    };
    onSelect(answer);
  }

  if (data.form !== "ganckhadeba") {
    return <p className="text-sm text-muted">This paper layout is not in this version.</p>;
  }

  return (
    <div className="ex-paper-wrap">
      {example ? <p className="ex-paper-kicker">მაგალითი</p> : null}
      {data.brief.trim() ? (
        <p className="ex-paper-brief">{streamFields ? <StreamWords text={data.brief} /> : data.brief}</p>
      ) : null}
      <div className={`ex-paper${example ? " is-example" : ""}`}>
        <div className="ex-paper-to">
          <GrowField
            value={liveTo}
            onChange={(value) => {
              setTo(value);
              emit({ to: value });
            }}
            placeholder="ვის მიმართავ"
            locked={frozen}
            align="right"
            ariaLabel="მიმართვა"
            streaming={streamFields}
          />
        </div>
        <p className="ex-paper-title">{paperFormTitle(data.form)}</p>
        <GrowField
          value={liveBody}
          onChange={(value) => {
            setBody(value);
            emit({ body: value });
          }}
          placeholder="მე, …"
          locked={frozen}
          multiline
          ariaLabel="განცხადების ტექსტი"
          streaming={streamFields}
        />
        <div className="ex-paper-foot">
          <GrowField
            value={liveDate}
            onChange={(value) => {
              setDate(value);
              emit({ date: value });
            }}
            placeholder="თარიღი"
            locked={frozen}
            ariaLabel="თარიღი"
            streaming={streamFields}
          />
          <GrowField
            value={liveSign}
            onChange={(value) => {
              setSign(value);
              emit({ sign: value });
            }}
            placeholder="სახელი, გვარი"
            locked={frozen}
            align="right"
            ariaLabel="ხელმოწერა"
            streaming={streamFields}
          />
        </div>
      </div>
    </div>
  );
}

export function paperReady(answer: PaperAnswer | null | undefined): boolean {
  if (!answer) return false;
  return Boolean(answer.to.trim() && answer.body.trim() && answer.sign.trim() && answer.date.trim());
}
