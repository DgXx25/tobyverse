"use client";

export const CLARIFY_OTHER_LABEL = "სხვა";

export function ClarifyChips({
  options,
  disabled,
  onPick,
  onOther,
}: {
  options: string[];
  disabled?: boolean;
  onPick: (value: string) => void;
  onOther: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          onClick={() => onPick(option)}
          className="rounded-full border border-border px-3 py-1 text-[12px] text-muted hover:border-accent hover:text-foreground disabled:opacity-40"
        >
          {option}
        </button>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={onOther}
        className="rounded-full border border-border px-3 py-1 text-[12px] text-muted hover:border-accent hover:text-foreground disabled:opacity-40"
      >
        {CLARIFY_OTHER_LABEL}
      </button>
    </div>
  );
}
