---
name: smooth-shadow-ring
description: "ALWAYS ACTIVE. In this project an elevation shadow must never be paired with a `border` (or a separate `ring`). Use `smooth-shadow-ring-{size}` from shadow-plugin, which bakes a 1px hairline edge into the shadow. Triggers whenever adding, editing, or reviewing a box-shadow / elevated surface — cards, popovers, dialogs, dropdowns, menus, tooltips, sheets, hover cards, toasts."
---

# Shadows never carry a border — use `smooth-shadow-ring-*`

Shadows come from [shadow-plugin](https://shadow.floriankiem.com) (imported in `globals.css`). Two families:

- `smooth-shadow-{size}` — a stacked, ringless shadow. `globals.css` also aliases Tailwind's own
  `shadow-xs` … `shadow-2xl` onto these stacks, so a plain `shadow-lg` already renders the smooth one.
- `smooth-shadow-ring-{size}` — the same shadow with a **1px hairline ring baked in as the final layer**,
  so the edge morphs into the shadow instead of sitting beside it.

Sizes: `xs`, `sm`, `md`, `lg`, `xl`, `2xl` (bare `smooth-shadow-ring` = `md`).

> There is no local `shadow-ring-*` or `hairline-*` utility any more — those were a pre-release
> copy of what the plugin now ships. `src/styles/shadow-ring.css` is gone; don't reintroduce it.

## The rule

**Any element with an elevation shadow gets its edge from `smooth-shadow-ring-{size}` — never from a
separate `border` or `ring` utility on the same element.**

A `border` next to a shadow reads washed-out and greyed, and it doubles the edge.

```tsx
// ❌ Don't — border + shadow stack into a washed, doubled edge
<div className="rounded-xl border bg-surface shadow-md">…</div>
<div className="rounded-xl bg-surface shadow-lg ring-1 ring-black/10">…</div>

// ✅ Do — one class carries both the shadow and the hairline
<div className="rounded-xl bg-surface smooth-shadow-ring-md">…</div>
```

When you touch an elevated surface (card, popover, dialog, dropdown/menu, tooltip, sheet, hover card,
toast, command palette), reach for `smooth-shadow-ring-{size}` and **remove any `border`, `border-*`,
`ring-1`, or `ring-*` that was providing its edge.**

## Tuning color

- **Ring:** `smooth-ring-{color}/{opacity}` — e.g. `smooth-shadow-ring-md smooth-ring-black/10`.
- **Shadow:** Tailwind's `shadow-{color}` — e.g. `shadow-blue-500` for a tinted glow.

Both compose, and neither touches the other.

### Leave the default alone unless the surface is too light for it

The plugin's default flips itself: `black/5` in light, `white/18` in dark, resolved through
`light-dark()` — which is why `html` declares `color-scheme: light dark` in `globals.css`. **Don't
override it per element by reflex.** An unscoped `smooth-ring-black/8` also clobbers the dark value,
and a `dark:smooth-ring-white/10` is *worse* than the default: the ring is an **outer** layer, so it
paints on the page *behind* the surface and takes its rendered color from that backdrop, not from the
fill it outlines. White 10% over a black page renders rgb(26,26,26) — darker than every surface token
— so it reads as a dark seam or as nothing.

Composite values for this site's dark tokens at the `white/18` default:

| fill | sits on | ring renders | edge |
| --- | --- | --- | --- |
| `surface` #1c1c1c | page #000 | rgb(46) | +18 ✅ |
| `surface` #1c1c1c | `surface-secondary` tray | rgb(60) | +32 ✅ |
| `surface-tertiary` #2e2e2e | `surface` track | rgb(69) | +23 ✅ |
| `surface-tertiary` #2e2e2e | page #000 | rgb(46) | **±0 ❌** |

So: the default is right for anything at `surface` or darker. The one case it can't cover is a
surface at `surface-tertiary` (or a custom grey that light) floating **directly on the black page** —
a portalled popup. Those need `dark:smooth-ring-white/28` explicitly; see `ui/select.tsx` and
`ui/menu.tsx`.

A knob or handle that is `bg-white` in **both** themes keeps an unscoped black ring
(`smooth-ring-black/12`) — the surface never flips, so the hairline shouldn't either.

## Trap: `--shadow` / `--shadow-lg` are COLOR tokens here

`colors.css` overloads `--shadow` and `--shadow-lg` as flat *color* tokens (backing the
`shadow-muted` / `shadow-emphasis` utilities). `var(--shadow-*)` in a box-shadow therefore resolves to
a bare color — an invalid layer that silently drops the elevation. Compose custom shadows from
`--smooth-shadow-*`, never `--shadow-*`.

## When a border is still fine

The rule is about **shadow + edge**. A `border` stays correct on **flat, unelevated** elements:

- Dividers, separators, table cell/row lines.
- Inputs, textareas, selects at rest (no elevation).
- Section outlines and inline chips sitting flush on the page.

If such an element later gains a shadow, switch it from `border … shadow-*` to
`smooth-shadow-ring-*` at the same time.

## Reviewing existing code

Treat `border` and `shadow-`/`ring-` in one `className` as a smell to fix. Replace the pair with the
matching `smooth-shadow-ring-{size}` and drop the border/ring. Treat a `dark:smooth-ring-white/{≤12}`
as a bug — that is an invisible edge.
