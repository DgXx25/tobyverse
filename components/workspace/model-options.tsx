"use client";

import { UiIcon } from "@/components/workspace/ui-icon";
import { usePreferredModel } from "@/components/account/use-preferred-model";

export function ModelOptions({
  onPicked,
  compact = false,
}: {
  onPicked?: () => void;
  compact?: boolean;
}) {
  const { model, options, setModel } = usePreferredModel();

  return (
    <div role="listbox" aria-label="Model">
      {options.map((option) => {
        const selected = option.id === model;
        const recommended = option.id === "auto";
        return (
          <button
            key={option.id}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => {
              setModel(option.id);
              onPicked?.();
            }}
            className={`flex w-full items-center justify-between rounded-lg text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              compact ? `${recommended ? "min-h-10 py-1" : "h-8"} px-2.5 text-[13px]` : "h-10 px-2.5 text-[14px]"
            } ${
              selected
                ? "bg-foreground/10 text-foreground"
                : "text-foreground hover:bg-foreground/10"
            }`}
          >
            <span className={recommended ? "flex flex-col" : ""}>
              <span>{recommended ? "Default" : option.name}</span>
              {recommended ? <span className="text-[10px] leading-3 text-muted">Recommended set of models</span> : null}
            </span>
            {selected ? <UiIcon name="check" size={14} className="text-foreground" /> : option.paidOnly ? <span className="text-[11px] text-muted">Premium</span> : null}
          </button>
        );
      })}
    </div>
  );
}
