"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useChatBlockState } from "@/components/workspace/chat-block-state";
import { formSchema, formTextLimit, prepareFormReply, type FormAnswers, type FormBlock } from "@/lib/blocks/kinds/form";
import "./form.css";

type FormProps = {
  block: FormBlock;
  streaming?: boolean;
  skipped?: boolean;
  onReply?: (text: string) => void | Promise<void>;
};

type FormState = { answers: FormAnswers; status: "editing" | "sending" | "submitted" };

export function FormView(props: FormProps) {
  const parsed = formSchema.safeParse(props.block);
  return parsed.success ? <ValidatedForm {...props} block={parsed.data} /> : null;
}

function ValidatedForm({ block, streaming = false, skipped = false, onReply }: FormProps) {
  const domId = useId();
  const [state, setState] = useChatBlockState<FormState>(`form:${JSON.stringify(block)}`, () => ({ answers: {}, status: "editing" }));
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const reply = prepareFormReply(block, state.answers);
  const frozen = streaming || skipped || !onReply || state.status !== "editing";
  const errors: Record<string, string> = showErrors && !reply.success ? reply.errors : Object.create(null);

  function update(id: string, value: string | string[]) {
    if (frozen) return;
    setError(null);
    setState((previous) => ({ ...previous, answers: { ...previous.answers, [id]: value } }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (frozen || sending.current || !onReply) return;
    setShowErrors(true);
    if (!reply.success) return;
    sending.current = true;
    setState((previous) => ({ ...previous, status: "sending" }));
    setError(null);
    try {
      await onReply(reply.text);
      setState((previous) => ({ ...previous, status: "submitted" }));
    } catch {
      setState((previous) => ({ ...previous, status: "editing" }));
      setError("Could not send your answers. Please try again.");
    } finally {
      sending.current = false;
    }
  }

  return (
    <form className="toby-form" onSubmit={(event) => void submit(event)} noValidate aria-labelledby={`${domId}-title`}>
      <div className="toby-form-header">
        <h4 id={`${domId}-title`}>{block.title}</h4>
        {block.help ? <p className="toby-form-help">{block.help}</p> : null}
      </div>
      <fieldset className="toby-form-fields" disabled={frozen}>
        <legend className="toby-form-sr-only">{block.title}</legend>
        {block.fields.map((field) => {
          const inputId = `${domId}-${field.id}`;
          const description = [field.help ? `${inputId}-help` : "", errors[field.id] ? `${inputId}-error` : ""].filter(Boolean).join(" ") || undefined;
          const label = <>{field.label}{field.required ? <><span className="toby-form-required" aria-hidden="true"> *</span><span className="toby-form-sr-only"> (required)</span></> : null}</>;
          const value = state.answers[field.id];
          return (
            <div className="toby-form-field" key={field.id}>
              {field.type === "radio" || field.type === "checkbox" ? (
                <fieldset className="toby-form-choices" role={field.type === "radio" ? "radiogroup" : undefined} aria-describedby={description} aria-required={field.type === "radio" ? field.required || undefined : undefined} aria-invalid={Boolean(errors[field.id]) || undefined}>
                  <legend>{label}</legend>
                  {field.help ? <p id={`${inputId}-help`} className="toby-form-help">{field.help}</p> : null}
                  <div className="toby-form-options">
                    {field.options.map((option) => (
                      <label className="toby-form-option" key={option.id}>
                        <input
                          type={field.type}
                          name={inputId}
                          value={option.id}
                          checked={field.type === "radio" ? value === option.id : Array.isArray(value) && value.includes(option.id)}
                          onChange={(event) => {
                            if (field.type === "radio") update(field.id, option.id);
                            else {
                              const selected = Array.isArray(value) ? value : [];
                              update(field.id, event.target.checked ? [...selected, option.id] : selected.filter((item) => item !== option.id));
                            }
                          }}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : (
                <>
                  <label className="toby-form-label" htmlFor={inputId}>{label}</label>
                  {field.help ? <p id={`${inputId}-help`} className="toby-form-help">{field.help}</p> : null}
                  {field.type === "textarea" ? (
                    <textarea id={inputId} rows={3} value={typeof value === "string" ? value : ""} placeholder={field.placeholder} maxLength={formTextLimit(field)} required={field.required} aria-describedby={description} aria-invalid={Boolean(errors[field.id]) || undefined} onChange={(event) => update(field.id, event.target.value)} />
                  ) : (
                    <input id={inputId} type="text" value={typeof value === "string" ? value : ""} placeholder={field.placeholder} maxLength={formTextLimit(field)} required={field.required} autoComplete="off" aria-describedby={description} aria-invalid={Boolean(errors[field.id]) || undefined} onChange={(event) => update(field.id, event.target.value)} />
                  )}
                </>
              )}
              {errors[field.id] ? <p id={`${inputId}-error`} className="toby-form-error">{errors[field.id]}</p> : null}
            </div>
          );
        })}
      </fieldset>
      <div className="toby-form-footer">
        <button type="submit" disabled={frozen || !reply.success}>{state.status === "submitted" ? "Sent" : state.status === "sending" ? "Sending…" : block.submitLabel ?? "Send answers"}</button>
        <span className="toby-form-status" role="status">{state.status === "submitted" ? "Answers sent to chat." : streaming ? "Available when the response is complete." : skipped || !onReply ? "Read-only form" : ""}</span>
      </div>
      {error || errors._form ? <p className="toby-form-error" role="alert">{error ?? errors._form}</p> : null}
    </form>
  );
}
