"use client";

import type { SYSTEM_INVENTORY } from "@/lib/admin/system-inventory";

type Inventory = typeof SYSTEM_INVENTORY;

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="border-b border-border py-4 first:pt-0"><h2 className="mb-2 text-[13px] font-medium text-foreground">{title}</h2>{children}</section>;
}

function PillList({ items }: { items: string[] }) {
  return <div className="flex flex-wrap gap-1.5">{items.map((item) => <span key={item} className="rounded-md border border-border px-2 py-1 font-mono text-[11px] text-muted">{item}</span>)}</div>;
}

export function SystemView({ inventory }: { inventory: Inventory }) {
  function download() {
    const blob = new Blob([JSON.stringify(inventory, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "tobyverse-system.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <section className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between gap-4"><h1 className="text-[17px] font-medium text-foreground">System</h1><button type="button" onClick={download} className="rounded-lg border border-border px-3 py-1.5 text-[12px] text-foreground hover:bg-surface-2">Download JSON</button></div>
      <Group title="Tools"><PillList items={[...inventory.tools]} /></Group>
      <Group title="Modes">{inventory.modes.map((mode) => <div key={mode.name} className="border-b border-border/70 py-3 last:border-0"><p className="text-[13px] font-medium capitalize text-foreground">{mode.name}</p><p className="mt-1 text-[12px] text-muted">{mode.instructions}</p><div className="mt-2"><PillList items={[...mode.tools]} /></div></div>)}<p className="mb-1 mt-3 text-[11px] uppercase text-muted">Intercept-only tools</p><PillList items={[...inventory.intercepts]} /><p className="mb-1 mt-3 text-[11px] uppercase text-muted">Composer intents</p><PillList items={[...inventory.intents]} /></Group>
      <Group title="Goals and recipes">{inventory.goals.map((item) => <div key={item.goal} className="border-b border-border/70 py-2 last:border-0"><p className="text-[13px] text-foreground">{item.label} <span className="font-mono text-[11px] text-muted">{item.goal}</span></p><p className="mt-1 text-[11px] text-muted">Theory {item.recipe.theoryCount} · Problems {item.recipe.problemCount} · Essays {item.recipe.essayCount}</p></div>)}</Group>
      <Group title="Blocks">{inventory.blocks.map((block) => <div key={block.id} className="py-2"><p className="font-mono text-[12px] text-foreground">{block.id}</p><p className="mt-0.5 text-[12px] text-muted">{block.when}</p></div>)}</Group>
      <Group title="Exercise types"><PillList items={inventory.exerciseTypes.map(({ type, category }) => `${type} · ${category}`)} /></Group>
      <Group title="Data written"><PillList items={inventory.collections.map(({ name }) => name)} /></Group>
    </div>
  </section>;
}
