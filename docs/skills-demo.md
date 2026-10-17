# Runtime subject guide demos

TobyVerse supports a small bundled Agent Skills library using `SKILL.md` files with YAML `name` and `description` frontmatter. Format reference: https://agentskills.io/specification.

The model sees the four names and short descriptions in the existing `load_skill` tool declaration. It chooses a guide when relevant, reads its complete body through a server-side tool result, and continues answering in the same tool loop. The core system instruction remains fully visible on every request. Guides are optional methods and examples, not automatic lessons or exercises. The existing lightweight subject conventions in `lib/skills/index.ts` remain in place.

| Guide | Demo topic |
| --- | --- |
| `technical-problem-solving` | Assumptions, units, selecting a method, checking a quantitative result |
| `algebra-equations` | Linear/quadratic equations, domains, checking roots |
| `calculus-derivatives` | Chain, product, quotient rules, domains |
| `statistics-estimation` | Sample mean, sample SD, standard error, confidence intervals |

## Try in chat

Use ordinary requests without guide names or implementation instructions. While the tool loop is running, its activity lines show which guide the model selected; they disappear when the final answer arrives. A mathematically correct answer alone does not prove activation.

**Algebra**

```text
ამოხსენი √(x + 5) = x - 1. მაჩვენე ამოხსნა და შეამოწმე ფესვები.
```

Expected: `x = 4`. Squaring also produces `x = −1`, which must be rejected against the original equation. Explain the relevant domain restriction and working in Georgian, without an unsolicited quiz.

**Derivatives**

```text
იპოვე (x² + 1)³-ის წარმოებული და მოკლედ ახსენი შიდა ფუნქციის როლი.
```

Expected: `6x(x² + 1)²` and a relevant chain-rule explanation.

**Statistics and a shared technical method**

```text
მონაცემებია 2, 4, 6. გამოთვალე საშუალო, შერჩევითი სტანდარტული გადახრა და საშუალოს სტანდარტული შეცდომა. ამოხსნა მაჩვენე და მოკლედ ამიხსენი ბოლო ორს შორის განსხვავება.
```

Expected: mean `4`, sample SD `2`, estimated SE `2/√3 ≈ 1.155`, with independent identically distributed observations assumed. The guide methods also apply when statistics supports a physics or engineering task.

**A physics problem**

```text
მანქანა უძრაობიდან იწყებს მოძრაობას და თანაბრად აჩქარებისას 8 წამში 24 მ/წმ სიჩქარეს აღწევს. რა აჩქარება აქვს და რა მანძილს გადის? ამოხსენი.
```

Expected: constant acceleration `3 m/s²`, distance `96 m`, with units and concise working. The shared technical guide can be selected across subjects.

**A problem supplied as a photo or material**

Attach a readable image or material containing a quantitative problem and write an ordinary request, for example:

```text
ამოხსენი ფოტოზე მოცემული ამოცანა.
```

The existing image/material input feeds the same model and tool loop. No extra instruction to load a guide is required. If essential text is unreadable, the model should ask for that missing information instead of inventing it. Guide selection remains a model decision, not an OCR or keyword guarantee.

**Normal automatic selection**

```text
იპოვე x/(x+1)-ის წარმოებული და მიუთითე სადაა ფუნქცია განსაზღვრული.
```

Expected: `1/(x+1)²`, `x ≠ −1`. The model decides whether a guide adds value. No guide is forced by a keyword router.

**Simple request**

```text
რამდენია 2+2? მხოლოდ პასუხი.
```

Expected: `4`, without an unnecessary guide call or a lesson. As with other model tool decisions, selection is probabilistic; the tool description requests restraint.

## Cost and limits

There is no extra classifier, vector database, embedding call, or new dependency for guides. Only compact metadata is sent before selection. Loading a guide still adds its text and a model continuation, so it is not free and may add latency. Each request allows at most two distinct guides; repeated IDs do not resend their bodies. Guides are not copied into stored chat history, so another request may load one again.

The loader accepts only catalog IDs and reads local bundled files. It cannot read arbitrary paths or URLs and does not execute scripts. It rejects empty or oversized bodies (12,000 characters), rather than silently trimming rules. Existing 10-second tool timeouts and text fallbacks apply. Missing files or invalid IDs remain nonfatal. User-material retrieval in `lib/rag` is unchanged.

## Add or edit a guide

1. Create `lib/skills/library/<name>/SKILL.md` with matching YAML `name`, a concise quoted `description`, and a short, useful Markdown body. Keep the folder name equal to `name`.
2. Add that same name and description to `lib/skills/catalog.ts`. Only metadata belongs in this module; it is also used by client-side tool schemas. Full bodies stay on the server.
3. Follow `docs/mindset.md`: adapt to the current request, preserve language and requested detail, and avoid mandatory teaching steps or exercises.
4. Run `node --test tests/runtime-skills.test.cjs tests/prompt-architecture.test.cjs tests/tool-foundation.test.cjs` and `npx tsc --noEmit --incremental false`. Update the expected demo catalog in the test when adding entries.

Next.js traces the guide files into the `/api/chat` server deployment through `outputFileTracingIncludes` in `next.config.mjs`. This demo supports bundled guide bodies only; it does not implement a user-uploaded marketplace, script runner, or separate reference-file loader.
