# Library and Mobile UX Improvements Design

## Goal

Improve the responsive TobyVerse workspace experience across the sidebar, composer controls, artifact panel, and Library without changing the desktop chat workflow unnecessarily.

## Scope

1. Add a subtle rounded hover/focus state to the sidebar profile control.
2. Fix mobile sidebar open/close stability so it does not immediately collapse after opening.
3. Reduce mobile start-screen heading and action sizing; arrange the actions in a compact 2×2 layout.
4. Make the Auto/Fast/Teacher parameters menu consistent on mobile and desktop, with item hover states and a short fade/slide entrance.
5. Replace the mobile artifact-panel overlay with a dedicated full-screen panel view that has an explicit back action. Preserve the existing desktop side-panel behavior.
6. Make Library filters compact on mobile, using a selector/dropdown pattern when the tab row no longer fits, and reduce the mobile search width.
7. Open Library notes directly in the viewer instead of navigating to chat. Provide an explicit action in the viewer to open that note in its source chat.
8. Use the new reaction assets in chat feedback controls: `like`/`deslike` when inactive and `like-filled`/`deslike-filled` when active.

## Design

### Sidebar and profile

Reuse the existing `sidebar-item-rest` visual language for the profile button and mobile account trigger. The mobile navigation state remains owned by `ShellProvider`; opening and closing must not be coupled to panel animation teardown or focus restoration in a way that changes the requested state.

### Composer controls

Keep the current parameter model and callbacks. Adjust only responsive sizing/layout and the shared menu item classes. The menu should animate from low opacity and a small vertical offset, while respecting reduced-motion preferences. Hover and focus-visible states must be available at every viewport width.

### Artifact panel

Use the existing `pendingPanel` and `focus` data flow. On mobile, opening an artifact panel should render a full-screen panel surface with a back control that returns to the chat route/view. On desktop, retain the current resizable side panel and header actions. Panel controls must remain functional when the panel is full-screen.

### Library notes

Keep Library item selection local to the Library route. Material files continue using the existing file preview. Sheet/note items open through a direct viewer path or viewer state, and the viewer receives enough source metadata to expose an “Open in chat” action. That action uses the existing workspace route helpers and pending-panel flow so the note is already focused when chat opens.

### Chat reactions

Keep the existing reaction state and feedback submission behavior. Only replace the rendered glyphs with the new public icons, selecting the filled asset when that message's reaction matches the control. Preserve accessible labels and `aria-pressed` state.

## Constraints

- Do not add a new dependency.
- Preserve the request-first TobyVerse voice rules in `docs/mindset.md` and `lib/ai/voice.ts`.
- Avoid unrelated refactors in the already modified worktree.
- Mobile-only layout changes must be scoped under the existing responsive breakpoints.
- Respect `prefers-reduced-motion` for all new transitions.

## Verification

- Add focused source-level regression checks for profile hover, parameter menu hover/animation, stable mobile navigation state, and Library note routing/viewer behavior.
- Run the targeted checks after each subsystem change.
- Run the project build or lint command available in the repository and report unrelated pre-existing failures separately.
