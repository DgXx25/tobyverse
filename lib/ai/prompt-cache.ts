/** Provider controls only: never shorten or rewrite the system instruction. */
export function withAnthropicCache(body: Record<string, unknown>, enabled = true, cacheMessages = true): Record<string, unknown> {
  if (!enabled || process.env.ANTHROPIC_PROMPT_CACHE === "0") return body;
  const cache_control = { type: "ephemeral" };
  const system = typeof body.system === "string" ? body.system : undefined;
  // The core and project are stable. Subject, memory, retrieved passages and
  // turn state can change independently, so they follow the stable breakpoint.
  const boundary = system?.search(/\n\n<(?:subject_skill|active_path|user_memory|turn_context|turn_materials)>/);
  const split = boundary !== undefined && boundary >= 0 ? boundary : system?.length ?? 0;
  const tools = Array.isArray(body.tools) ? body.tools.map((tool, index, items) =>
    index === items.length - 1 ? { ...tool, cache_control } : tool,
  ) : undefined;
  return {
    ...body,
    // Automatic caching also reuses growing history and intermediate tool results.
    ...(cacheMessages ? { cache_control } : {}),
    ...(system ? { system: [
      { type: "text", text: system.slice(0, split), cache_control },
      ...(split < system.length ? [{ type: "text", text: system.slice(split) }] : []),
    ] } : {}),
    ...(tools ? { tools } : {}),
  };
}
