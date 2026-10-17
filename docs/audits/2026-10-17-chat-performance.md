# Long chat rendering audit

Scope: typing, scrolling and rich blocks in ProjectChat. Local development browser, October 17, 2026. Synthetic messages were local fixtures; they were not saved to the user's project or sent to a model. The temporary fixture route was removed after verification.

## Findings

- Draft state lived in ProjectChat, so typing reconciled every message and its rich content.
- Every assistant render parsed the preceding history for paper blocks, creating repeated work across rows.
- Offscreen SVG scenes kept running their CSS animations.
- The 40-message realtime page could replace previously loaded assistant history. The normal fast-opening route did not supply the older-page cursor needed by the existing loader.

## Changes

- ChatComposer can own its draft locally; its existing controlled mode remains available for other screens.
- [TanStack Virtual](https://tanstack.com/virtual/latest/docs/chat) 3.14.21 mounts the viewport and two neighboring rows on each side, measures dynamic heights, preserves keyed anchors on prepend, and follows appended/streamed output only when already at the end. Scroll-only positioning stays inside the virtual thread.
- Settled RichContent is memoized, parsed layouts are reused, and history metadata/paper context are indexed once per history update. The realtime decoder preserves identities for unchanged rows.
- Offscreen and hidden-page scene animations pause. Compact interaction values are kept outside mounted rows, including chart controls, scene tabs, paper fields and feedback, and visual slideshow position. Completed quiz scores live in the chat controller so completion is retained even when the card is offscreen.
- Older history loads in 40-message pages through the same Firestore decoder as realtime messages. A recent snapshot merges into already loaded history. Loading is guarded against concurrent requests and exhaustion.
- A partial local Firestore cache cannot declare the history exhausted. Reply-mode changes do not restart the history subscription. Hidden notebook routes ignore zero-size row measurements and scroll writes; the composer retains its last nonzero height.
- Condensed the previous turn's LaTeX instruction to retain its behavior while restoring the documented 150–400-word core limit.

## Evidence

| Scenario | Observed result |
| --- | --- |
| Existing project before | 20 mounted messages, 2,370 DOM elements; offscreen plant scenes still playing |
| Same project after | 5 mounted messages, 1,236 DOM elements; offscreen scene paused |
| 10,000 mixed rich messages at latest | 3 mounted messages, 345 nodes inside the history |
| 64 individually typed characters at latest | 0 history commits; input-to-next-frame p95 9.5 ms |
| 10,041 messages at 390px while reading history | 6 mounted messages, 539 nodes inside the history |
| 40 individually typed characters in that narrow history | 0 history commits; input-to-next-frame p95 9.9 ms |
| Prepend 40 messages while reading | Same message remained at the identical vertical position: 0px shift |
| Append and grow a reply in 25 updates while at latest | Latest row stayed visible and pinned to the bottom |
| Append a reply while reading history | Reading position remained in history; tail was not mounted |
| Change a chart slider from 2 to 3.5; scroll away and back | Row unmounted, then remounted with value 3.5 |
| Narrow/widen viewport | Current history remained present; chart value persisted |

The fixture measured input-to-next-animation-frame latency, not a hardware-independent FPS guarantee. It ran in Next.js development mode. Data/index memory still grows with explicitly loaded history; mounted DOM and rich component trees stay bounded by the viewport. Browser Find only sees mounted rows; the application's chat search uses stored data separately. Extremely large individual responses can still be expensive because virtualization operates per message.

Automated coverage: merge preservation and stable identities, ordered paper context, bounded ranges across 10,000 variable-height rows, isolated retained state and listener cleanup, plus existing rich rendering/scene/opening tests.

Final focused suite: 36/36 passed, including a 5,000-paper case retaining 4,999 prior-paper references rather than every cumulative prefix. TypeScript passed. An expanded 90-test run passed 88; the two failures are existing static expectations in `chat-resilience.test.cjs` for an `api/projects/bootstrap` route call and an `if (partial)` branch. Both expectations also fail against the unchanged HEAD versions of those files.

The final production build completed with exit 0 after all review corrections. Existing lint warnings remain in unrelated code; no new hook warning remains. A fresh localhost reload produced no new runtime errors. Switching to another existing notebook and back retained the original scroll offset (9,662px), total scroll height (10,498px), and five mounted rows.

An independent read-only review found and resolved paging resets, cache-snapshot exhaustion, offscreen quiz score retention and quadratic paper-prefix storage. No remaining blockers were found in the follow-up review.
