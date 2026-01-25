# Align Admin Overview + Sidebar With Clawdbot (Shadcn UI)

This ExecPlan is a living document. The sections Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.

This plan follows .agent/PLANS.md and must be maintained accordingly.

## Purpose / Big Picture

After this change, the admin Overview page mirrors Clawdbot’s information architecture while keeping our existing chat input at the bottom. Users will see a clear Gateway Access block (connection + auth), a Snapshot block (status + uptime + refresh hints), a stats row (instances/sessions/cron next), and the existing Service + Manual Run cards. A new Skills page will appear in the sidebar to match Clawdbot’s navigation patterns. All UI stays within the existing Shadcn component system.

## Progress

- [ ] (2026-01-26 00:00Z) Create a new ExecPlan under .agent and capture assumptions about sidebar items and layout changes.
- [ ] Update sidebar navigation to include Skills and any required Clawdbot parity items.
- [ ] Redesign Overview widgets layout to match Clawdbot structure, while keeping the chat input below the cards.
- [ ] Add a Skills page scaffold and wire it into routing.
- [ ] Validate UI locally with bun run dev and confirm layout/interaction.
- [ ] Update docs/admin-ui.md if new navigation or overview behavior needs to be documented.

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Keep the current typography and theme system rather than introducing a new font system.
  Rationale: The project already has a design system in place; frontend-design guidance says to preserve established patterns when working within an existing system.
  Date/Author: 2026-01-26 / Codex

## Outcomes & Retrospective

Pending. Will be completed after implementation.

## Context and Orientation

The admin app lives in apps/admin. The Overview page is apps/admin/app/(app)/page.tsx and uses apps/admin/components/widgets.tsx to render its card grid. Sidebar navigation is defined in apps/admin/components/navigation/app-sidebar.tsx and uses Shadcn sidebar components from apps/admin/components/ui/sidebar.tsx. Settings live at apps/admin/app/(app)/settings/page.tsx. The chat UI is embedded below the cards in Overview via DashboardChat and must remain there.

We will reshape the Overview content by editing widgets.tsx (and any helper UI components) and update the sidebar list. We will add a Skills page at apps/admin/app/(app)/skills/page.tsx and connect it in the sidebar.

## Plan of Work

First, update the sidebar items to include a Skills entry (and any additional Clawdbot items that are explicitly required). The request mentions a screenshot of Clawdbot’s sidebar; because that list is not in the repository, we will assume the minimal necessary addition is a Skills entry alongside Overview and Settings. If the user provides a definitive list, update the plan to reflect it before finalizing.

Second, restructure widgets.tsx to remove Admin auth, Summary, and Gateway plugins cards from Overview. Replace them with a Gateway Access card and Snapshot card (matching Clawdbot’s Overview). Add a stats row below for Instances, Sessions, and Cron next run. Keep Service and Manual Run cards, and keep the chat UI below as it is now. Use existing Shadcn Card, Badge, Button, Input, and Typography utilities; avoid introducing non-system components.

Third, scaffold a Skills page that matches the existing admin aesthetic (simple list, search input, placeholder content). Use Shadcn list items, badges, and empty-state components. No backend wiring is required yet; it can be a static placeholder with a clear “Coming soon” and a short description.

Finally, run the admin app locally and verify the layout looks correct and the chat input remains below the cards. Update docs/admin-ui.md if Overview/Sidebar behavior changes should be documented.

## Concrete Steps

1) Update sidebar navigation.
   - File: apps/admin/components/navigation/app-sidebar.tsx
   - Add a Skills nav item (icon from lucide-react, e.g. Sparkles or BookOpen) between Overview and Settings, unless the user provides a different ordering.

2) Redesign Overview widgets.
   - File: apps/admin/components/widgets.tsx
   - Replace the top widget grid with:
     - Gateway Access card: URL, token, password (optional placeholder input), session key input, Connect/Refresh actions.
     - Snapshot card: status, uptime, tick interval (if available), last channels refresh (if available), and auth hint text when disconnected.
   - Add a stats row (instances, sessions, cron next run) under the Snapshot row.
   - Keep Service card and Manual run card, but move them below the new top section.
   - Remove Admin auth, Summary, and Gateway plugins cards from Overview.

3) Add Skills page scaffold.
   - File: apps/admin/app/(app)/skills/page.tsx
   - Layout: header, short description, placeholder list (cards or table) with “Coming soon” message. Use Shadcn components only.

4) Check layout locally.
   - Command (repo root): bun run dev
   - Navigate to http://localhost:3000/ and confirm the new Overview layout with chat input below.
   - Navigate to /skills and confirm the page renders.

5) Update docs if needed.
   - File: docs/admin-ui.md
   - Add a short note about the Skills page if present.

## Validation and Acceptance

The change is accepted when:

- Sidebar shows Overview, Skills, and Settings, and Skills page renders at /skills.
- Overview page shows Gateway Access + Snapshot at the top, stats row beneath, then Service and Manual Run cards.
- Chat input remains at the bottom of the Overview page.
- No console errors in the browser and the admin UI renders with the existing theme.

## Idempotence and Recovery

Changes are additive and safe. Re-running the steps should not break state. If the new layout causes issues, revert only the modified files listed in this plan.

## Artifacts and Notes

Expected UI behavior:

  - Overview cards appear in three tiers: Access/Snapshot, stats row, Service/Manual run.
  - Chat input stays fixed below the card content in Overview.
  - Skills page loads with placeholder content.

## Interfaces and Dependencies

Use only existing Shadcn UI components already in apps/admin/components/ui and lucide-react icons. No new UI libraries are required. The Skills page is static and should not require new data APIs. If new placeholders need dummy data, keep them inline in the page component.

Plan update note: Initial creation of this ExecPlan based on the user request to align Overview with Clawdbot and add a Skills page. Assumed minimal sidebar additions due to missing reference image.
