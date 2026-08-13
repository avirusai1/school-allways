# 11 — Design System

**The single source of visual truth for both apps and all four web surfaces.**

Every colour, size, radius and duration in the product comes from this file. A
hardcoded hex in a widget is a bug. Consistency across 60+ screens is achieved by
having one place to change things, not by discipline.

---

## 1. Design principles — the point of view

We are building for a **school office in Jaipur, a teacher's ₹9,000 Android, and
a parent who is anxious about their child.** Not for a design award.

1. **Density over drama.** A class teacher must see 40 students without
   scrolling. Generous whitespace is a desktop-SaaS aesthetic that actively
   fails a school roster. We are closer to a well-made banking app than to a
   landing page.
2. **Institutional, not playful.** Schools are formal, hierarchical
   institutions. A principal forwards our report to their trust. Rounded
   pastels and cheerful mascots undermine that. Restrained, confident, precise.
3. **Legible in sunlight, at arm's length, by a 50-year-old.** Minimum 15px body
   text. High contrast. Never grey-on-grey.
4. **Every pixel earns its place.** No decorative illustration where a number
   would do. No card where a row would do.
5. **Boring is a feature.** Users open this app five times a day for years. It
   should be invisible, fast, and never surprising.

---

## 2. What "AI-generated UI" looks like, and what we do instead

This is the explicit anti-brief. If a screen has any of these, it is wrong.

| ❌ The tell | ✅ What we do |
|---|---|
| Purple/indigo gradient hero, `#6366F1` → `#A855F7` | One flat institutional blue. No gradients anywhere except the login backdrop. |
| Glassmorphism, blurred translucent cards | Flat surfaces, 1px borders, one shadow level |
| Emoji as icons (📚 🎓 ✅) | One icon set (Phosphor), single weight, 20/24px |
| Every element in a rounded card with a big shadow | Cards only for genuinely separate objects. Lists are rows with dividers. |
| Everything centred with huge padding | Left-aligned, 16px screen padding, dense rows |
| 6 chart colours, all saturated, rainbow order | 1 primary + 2 neutrals. Categorical only when unavoidable. |
| Inconsistent radii — 8 here, 12 there, 20 there | Exactly three: 6, 10, 16 |
| Random icon sizes and stroke weights | 20px inline, 24px standalone, one weight |
| Generic stock illustrations in empty states | A single-line icon + one sentence + one action |
| "Welcome back, User! 👋" | "Class 5-A · Attendance" |
| Text at 3–4 different greys per screen | Exactly three text colours |
| Buttons in 5 sizes | Three: 48 primary, 40 compact, 32 inline |
| Animated gradient borders, floating blobs | Motion only to explain a state change |
| `space-y-4` everywhere regardless of relationship | 8pt rhythm reflecting actual grouping |

**The single strongest signal of hand-crafted UI: vertical rhythm.** Related
things are 8px apart, groups are 16px apart, sections are 24px apart, and it is
identical on every screen. Get that right and the product reads as considered
even before anyone notices the colours.

---

## 3. Colour

Full ramps, not six accent colours. Every value is used somewhere; nothing is
decorative.

```
BRAND — deep institutional blue. Trust, permanence, not "tech startup".
blue/50    #F1F6FB
blue/100   #DCE8F4
blue/200   #B4CDE6
blue/300   #7FA9D1
blue/400   #4A82B8
blue/500   #1B5E9C   ← primary
blue/600   #164E82
blue/700   #123E68
blue/800   #0E2F4F
blue/900   #0A2138

ACCENT — warm amber. Used sparingly: primary CTA, active nav, highlights.
amber/50   #FEF7EC
amber/100  #FBE9CC
amber/200  #F6D293
amber/300  #F2BC5F
amber/400  #EFAA3C
amber/500  #D98D1B   ← accent
amber/600  #B57113
amber/700  #8F570E

NEUTRAL — slightly cool grey, never pure black.
grey/0     #FFFFFF
grey/25    #FAFBFC   app background
grey/50    #F4F6F8   surface alt, table header
grey/100   #EAEEF2   dividers on dark surfaces
grey/200   #DAE0E6   borders
grey/300   #BFC8D2   disabled border
grey/400   #94A2B1   placeholder
grey/500   #6B7B8C   tertiary text
grey/600   #52627340
grey/700   #3D4C5C   secondary text
grey/800   #26313D
grey/900   #16202B   primary text

SEMANTIC
green/50  #EDF7F1   green/500 #2E7D4F   green/700 #1F5A38
red/50    #FCEEEC   red/500   #C0392B   red/700   #8E2A20
orange/50 #FDF3E7   orange/500 #C77700  orange/700 #954F00
cyan/50   #EBF4FA   cyan/500  #2A6FA8   cyan/700  #1D5079

ATTENDANCE — fixed, never re-themed. Muscle memory matters here.
present green/500 · absent red/500 · late orange/500
half-day cyan/500 · leave grey/500 · holiday grey/300
```

**Usage rules**

- **Text: exactly three colours.** `grey/900` primary, `grey/700` secondary,
  `grey/500` tertiary. A fourth grey is a bug.
- **Backgrounds: two.** `grey/25` app, `grey/0` surface.
- **One border colour:** `grey/200`.
- **Amber is rationed.** Primary CTA and active nav indicator only. If a screen
  has three amber elements, two are wrong.
- **Never colour as the only signal.** Attendance chips carry a letter (P/A/L)
  as well as a colour — ~8% of male users are colour-blind.
- **White-label:** a school overrides `blue/500`; ramps regenerate. Amber,
  neutrals and semantics never change.

### Dark mode

Ship light-only for v1. Say so explicitly rather than shipping a half-tuned dark
theme — a bad dark mode looks more amateur than none. Structure tokens so it can
be added later: never reference a raw ramp value in a widget, only a semantic
token (`color.text.primary`, not `grey/900`).

---

## 4. Typography

```
Latin:      Inter            (400, 500, 600, 700)
Devanagari: Noto Sans Devanagari (400, 500, 600, 700)
Numerals:   Inter with tabular figures — REQUIRED for marks, money, roll numbers
```

Bundle both. **Test every screen with Hindi from day one** — Devanagari has
taller ascenders and will break line heights tuned only for Latin. Retrofitting
is a layout rewrite.

| Token | Size/Line | Weight | Tracking | Use |
|---|---|---|---|---|
| `display` | 28/34 | 700 | -0.4 | Login, empty-state headline |
| `h1` | 22/28 | 600 | -0.3 | Screen title |
| `h2` | 18/24 | 600 | -0.2 | Section header, card title |
| `h3` | 16/22 | 600 | -0.1 | Subsection, list group |
| `body` | 15/22 | 400 | 0 | Default |
| `bodyMedium` | 15/22 | 500 | 0 | Emphasised body, list primary |
| `bodySmall` | 13/18 | 400 | 0 | Secondary line |
| `label` | 13/16 | 500 | 0.1 | Form labels, tabs |
| `caption` | 12/16 | 500 | 0.2 | Chips, timestamps, helper |
| `overline` | 11/14 | 600 | 0.8 | UPPERCASE section eyebrow |
| `numeric` | 15/22 | 500 | 0 | Tabular: marks, money, counts |
| `numericLarge` | 24/30 | 600 | -0.2 | Dashboard stat values |

**Rules**

- Body is **15px, never 14 or 16.** One body size across the product.
- Maximum **three type styles per screen region**.
- Never centre body text. Titles left-aligned too, except in empty states.
- Never use weight 300 or italic. Ever.
- Money and marks always `numeric` — proportional figures make a column of
  numbers look broken.

---

## 5. Spacing — 8pt grid, no exceptions

```
space/0   0     space/1   4     space/2   8     space/3  12
space/4   16    space/5   20    space/6   24    space/8  32
space/10  40    space/12  48    space/16  64
```

**The rhythm that makes it look designed** — memorise this table:

| Relationship | Gap |
|---|---|
| Icon → its label | 8 |
| Label → its input | 6 |
| Two lines in one list row | 2 |
| Two rows in a list | 0 (divider) |
| Two fields in a form | 16 |
| Two groups in a form | 24 |
| Section header → content | 12 |
| Two sections | 32 |
| Screen edge → content | 16 (mobile) / 24 (tablet) / 32 (web) |
| Content → bottom nav | 16 |

If a gap isn't in this table, it's wrong.

## 6. Shape, border, elevation

```
radius/sm    6    chips, badges, inputs, small buttons
radius/md   10    cards, sheets, buttons, dialogs
radius/lg   16    bottom sheets (top corners), modals
radius/full 999   avatars, pills, FAB
```

**Three radii total.** Never 8, never 12, never 20.

```
border      1px solid grey/200        the default separator
borderFocus 2px solid blue/500
```

**Elevation — two levels, and prefer borders.**

```
shadow/sm   0 1px 2px rgba(22,32,43,0.06)      cards, raised rows
shadow/md   0 4px 12px rgba(22,32,43,0.10)     sheets, dropdowns, dialogs
```

No `shadow/lg`, no coloured shadows, no glow. Most separation in this product is
a **1px border or a divider**, not a shadow. Shadow-heavy cards are the fastest
route to generic-looking UI.

---

## 7. Motion

```
duration/instant  100ms   state colour, ripple
duration/fast     160ms   toggles, chips, checkbox
duration/base     220ms   sheets, dialogs, expand
duration/slow     320ms   page transitions
easing/standard   cubic-bezier(0.2, 0, 0, 1)
easing/decelerate cubic-bezier(0, 0, 0, 1)     entering
easing/accelerate cubic-bezier(0.3, 0, 1, 1)   exiting
```

**Rules**

- Motion explains a state change. Nothing animates for delight.
- No animation above 320ms. Ever.
- **No skeleton shimmer animation** — use a static grey block. Shimmer on a
  ₹9,000 phone drops frames and is a well-known AI-template tell.
- Respect `prefers-reduced-motion` / `disableAnimations`.
- Page transitions: horizontal slide for push, fade for tab switch. Nothing else.

---

## 8. Iconography

- **Phosphor Icons**, `regular` weight only. One set, no mixing.
- **20px** inline with text · **24px** standalone/nav · **32px** empty states.
- Icon colour always matches its adjacent text colour.
- **Never an emoji in the UI.** Not in empty states, not in nav, not in a chip.
- Never an icon without a label in primary navigation.

---

## 9. Component specifications

Exact values. Build these once in `design_system`; never restyle inline.

### Button

| Variant | Height | Padding | Radius | Fill | Text |
|---|---|---|---|---|---|
| Primary | 48 | 20h | md | `amber/500` | `grey/900` 15/600 |
| Secondary | 48 | 20h | md | `blue/500` | `grey/0` 15/600 |
| Outline | 48 | 20h | md | transparent, 1px `grey/300` | `grey/900` 15/500 |
| Ghost | 40 | 12h | sm | transparent | `blue/500` 15/500 |
| Danger | 48 | 20h | md | `red/500` | `grey/0` 15/600 |
| Compact | 40 | 16h | sm | as above | 14/500 |
| Inline | 32 | 12h | sm | as above | 13/500 |

States: pressed = 8% darker · disabled = `grey/100` fill, `grey/400` text, no
border · loading = 16px spinner replacing the label, width preserved so the
button doesn't jump.

Full-width buttons only in bottom sheets and forms. Never in a list row.

### Input

```
height        48 (single-line)
padding       12h, 14v
radius        sm (6)
border        1px grey/300
focus         2px blue/500, no glow
error         2px red/500 + 13px red/700 helper text below
label         above the field, 13/500 grey/700, 6px gap  ← never a floating label
placeholder   grey/400
disabled      grey/50 fill, grey/400 text
```

**Labels sit above the field, always visible.** Floating/placeholder-as-label
fails for form-heavy admin work and for users switching languages.

### List row — the workhorse of this product

```
minHeight     56 (single-line) / 64 (two-line) / 72 (with avatar + two lines)
padding       16h
divider       1px grey/200, inset 16 from left, full-bleed right
structure     [leading 40] 12 [title / subtitle] flex [trailing] 8 [chevron 20]
title         bodyMedium grey/900
subtitle      bodySmall grey/500, 2px below title
pressed       grey/50 background
```

Lists do **not** get cards, shadows, or gaps between rows. Rows + dividers.

### Card

Use only for genuinely separate objects (a notice, a stat, an invoice) — never
as a wrapper around a list.

```
padding   16
radius    md (10)
border    1px grey/200
shadow    none by default; shadow/sm only when floating over content
gap       12 between cards
```

### Chip / status pill

```
height 24 · padding 8h · radius full · caption 12/500
fill = semantic/50 · text = semantic/700 · no border
Always carries a letter or word, never colour alone.
```

### App bar

```
height 56 · background grey/0 · bottom border 1px grey/200 (no shadow)
title h1, left-aligned, 16 from leading edge
actions 24px icons, 8 gap, 16 from trailing edge
scrolled: border remains, background stays solid
```

### Bottom navigation (family app)

```
height 60 + safe area · background grey/0 · top border 1px grey/200
icon 24 · label caption 11/500 · active blue/500 · inactive grey/500
active indicator: 3px amber/500 bar at the top edge of the item
maximum 5 items
```

### Empty state

```
icon 32px grey/300 (Phosphor, not an illustration)
16 gap
headline h3 grey/900        e.g. "No homework yet"
8 gap
body bodySmall grey/500     one sentence, explains what will appear here
20 gap
one Outline button          the single most likely action
```

Never an illustration, never more than one action, never an exclamation mark.

### Loading

Skeletons matching the real layout: `grey/100` blocks at the exact dimensions of
the content they replace. **Static, no shimmer.** Full-screen spinners only for a
blocking action (payment submission).

### Error

Inline banner: `red/50` fill, 1px `red/500` left border (3px), 12px padding,
`bodySmall red/700`, with a "Retry" ghost button. Never a toast for an error the
user must act on.

### Data table (web admin)

```
header    grey/50, overline 11/600 grey/700, 40 high, sticky
row       48 high, 1px grey/200 bottom border
hover     grey/25
selected  blue/50
numeric   right-aligned, tabular figures
actions   right-most column, ghost icon buttons, visible on hover
zebra     none — dividers are enough
density   comfortable 48 / compact 40 (user toggle, persisted)
```

Virtualise above 100 rows. A 900-student table must not render 900 DOM nodes.

---

## 10. Screen composition rules

1. **One primary action per screen**, bottom-right FAB (mobile) or top-right
   (web). Everything else is secondary.
2. **Titles are nouns, not greetings.** "Class 5-A · Attendance", never
   "Welcome back!".
3. **Numbers before words on dashboards.** `numericLarge` value, `caption`
   label beneath, in that order.
4. **Maximum one card style per screen.**
5. **Bottom sheets for anything under ~6 fields**, full page above that.
6. **Destructive actions** need a confirm dialog naming the specific object:
   "Delete attendance for 5-A on 10 August?" — never "Are you sure?".
7. **Dates render as `10 Aug 2026`** in the UI, never `2026-08-10` and never
   `10/08/2026` (ambiguous for anyone reading it as US format).
8. **Money renders as `₹1,250.50`** with Indian digit grouping (`₹12,50,000`
   not `₹1,250,000`). Put this in one formatter and never format inline.

---

## 11. Density profiles

Two, chosen per screen, never mixed inside one screen.

| Profile | Row | Body | Padding | Used on |
|---|---|---|---|---|
| **Comfortable** | 64 | 15 | 16 | Parent app, dashboards, detail screens |
| **Compact** | 44 | 14 | 12 | Attendance marking, marks entry, admin tables |

**Compact exists because of one screen:** 40 students must fit without
scrolling. That constraint is why this product does not look like a generic SaaS
template, and it should be visible in the design.

---

## 12. Accessibility (non-negotiable)

- Contrast ≥ 4.5:1 body, ≥ 3:1 large text. `grey/500` on `grey/0` = 4.6:1 ✓.
  `grey/400` is for placeholders only, never content.
- Touch targets ≥ 48×48, even when the visual is smaller.
- Every icon-only button has a semantic label.
- Full keyboard navigation on web with a visible 2px `blue/500` focus ring.
- Support up to 200% text scaling without clipping — test the attendance screen
  specifically, it is the tightest layout.
- Never colour alone as a signal.

---

## 13. Implementation

### Flutter — `packages/flutter/design_system/`

```
lib/
├── design_system.dart          barrel
├── tokens/
│   ├── colors.dart             AppColors — full ramps as static consts
│   ├── typography.dart         AppTypography — TextTheme + numeric styles
│   ├── spacing.dart            AppSpacing — the 8pt scale
│   ├── radius.dart             AppRadius
│   ├── elevation.dart          AppShadows
│   └── motion.dart             AppDurations, AppCurves
├── theme/
│   ├── app_theme.dart          ThemeData factory, takes school primaryColor
│   └── theme_extensions.dart   custom tokens Material doesn't model
└── components/
    ├── buttons/     app_button.dart, icon_button.dart
    ├── inputs/      app_text_field.dart, app_dropdown.dart, app_date_field.dart
    ├── display/     app_card.dart, app_list_tile.dart, app_chip.dart,
    │                stat_tile.dart, avatar.dart, section_header.dart
    ├── feedback/    empty_state.dart, error_state.dart, skeleton.dart,
    │                app_snackbar.dart, confirm_dialog.dart
    ├── layout/      app_scaffold.dart, app_bar.dart, bottom_nav.dart,
    │                app_bottom_sheet.dart
    └── domain/      attendance_chip.dart, student_tile.dart, money_text.dart,
                     fee_status_badge.dart
```

**`AppTheme.build(primaryColor)`** returns a complete `ThemeData` so a
white-labelled school re-themes with one value. Widgets read
`Theme.of(context)` and the custom `AppThemeExtension` — **never `AppColors`
directly in a feature widget.**

### Web — Tailwind

`packages/ui/tailwind.config.ts` exports the identical tokens. Colours are CSS
custom properties so a school's primary can be swapped at runtime:

```css
:root { --color-primary-500: 27 94 156; }  /* space-separated RGB for /opacity */
```

`packages/ui/src/components/` mirrors the Flutter component list one-to-one so
web and mobile stay visually identical. Same names, same props where possible.

---

## 14. Definition of done for any screen

- [ ] Uses only tokens — zero hardcoded hex, px, or duration
- [ ] Loading, empty, error and content states all implemented
- [ ] Gaps match the §5 rhythm table
- [ ] Maximum three text colours
- [ ] Exactly one primary action
- [ ] Renders correctly in Hindi
- [ ] Renders at 200% text scale without clipping
- [ ] Touch targets ≥ 48px
- [ ] No emoji, no gradient, no shimmer, no shadow beyond `shadow/sm`
- [ ] Looks identical in the app and the web equivalent
