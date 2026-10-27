# Layout system

Marketing pages use a 12-column grid and product screens use a rail, a top bar, a 12-column main region and an inspector, all built from the spacing tokens, so the graph can dominate and everything else supports it.

## Grids

| Grid | Tokens | Rule |
|---|---|---|
| Marketing, 12 columns | `marketing-columns` 12, `marketing-gutter` 24px, `marketing-margin` 64px, `max-marketing` 1200px | Hero spans 8 columns; evidence and proof sections span 6 or 12. Margin drops to 32px below `bp-md`. |
| Product application | `app-rail-width` 232px, `app-topbar-height` 64px, `app-inspector-width` 360px, `app-columns` 12, `app-gutter` 24px, `app-margin` 32px | Rail fixed left, top bar fixed, inspector right and optional, main 12 fluid columns. Design width `max-app` 1440px; beyond it the graph canvas grows and panels do not. |

The ThreadGraph canvas takes at least 8 of the 12 main columns on every system screen. Tables and evidence sit below or in the inspector; a screen of cards is a failed layout.

## Scales

- **Spacing**: `space-1` 4, `space-2` 8, `space-3` 12, `space-4` 16, `space-5` 24, `space-6` 32, `space-7` 48, `space-8` 64, `space-9` 96. Use `space-4` inside panels, `space-5` between grid cells, `space-6` between panels, `space-7` between sections.
- **Border**: `border-hairline` 1px with `line` for dividers and `border-strong` for controls. Dashed borders mean forecast, inferred, caution or simulated; solid Verdigris means preserved or approved; solid Ember means hostile or declined.
- **Radius**: `radius-none` for tables, `radius-sm` 2px for chips, `radius-md` 4px for everything else, `radius-node` for circular graph nodes.
- **Elevation**: `elevation-0` page, `elevation-1` cards and toasts, `elevation-2` drawers and dialogs, all a 1px ring plus a surface step. `z-rail` 10, `z-topbar` 20, `z-drawer` 30, `z-dialog` 40, `z-tooltip` 50, `z-toast` 60.

## Responsive behaviour

| Breakpoint | Token | Layout |
|---|---|---|
| Phone | `bp-sm` 640px | One column, rail becomes a bottom bar, inspector is a full-screen sheet, derivations inline instead of in tooltips |
| Tablet | `bp-md` 960px | Rail shows index numbers only, inspector is a drawer over the graph |
| Laptop | `bp-lg` 1280px | Full rail, graph plus inspector |
| Wide | `bp-xl` 1600px | Graph canvas grows, panels hold their width |

## Maximum content widths

`max-marketing` 1200px, `max-prose` 640px for reading text, `max-app` 1440px, `max-drawer` 480px, `max-dialog` 560px, `max-toast` 400px.

## Rules that trace to the promise

- Put the graph where the eye lands first and keep the Verdigris business thread visible on every system screen, including while a dialog is open (`scrim` dims it, never hides it).
- Never place a panel over the cut point or the business thread.
- Persistent `simulated` chip in the top bar while demonstration data is on.
