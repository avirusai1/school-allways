# 15 — Web Surfaces

Four builds, **all static on Cloudflare Pages**. Nothing runs on the Oracle box
except the API — this roughly triples the free VM's headroom and is the single
biggest infra decision in the project.

**Read `build/11-design-system.md` first.** Web and mobile must look like the
same product; `packages/ui` mirrors the Flutter component list one-to-one.

---

## 1. Shared foundation (`packages/ui`)

```
packages/ui/
├── tailwind.config.ts        the SAME tokens as design_system
├── src/components/
│   ├── Button.tsx  Input.tsx  Select.tsx  DatePicker.tsx
│   ├── Card.tsx  ListRow.tsx  Chip.tsx  StatTile.tsx  Avatar.tsx
│   ├── DataTable.tsx         virtualised, sticky header, density toggle
│   ├── EmptyState.tsx  ErrorState.tsx  Skeleton.tsx
│   ├── Sheet.tsx  Dialog.tsx  ConfirmDialog.tsx  Toast.tsx
│   └── MoneyText.tsx  DateText.tsx      Indian formatting, one place
└── src/hooks/
```

Colours as CSS custom properties so a school's primary swaps at runtime:
```css
:root { --color-primary-500: 27 94 156; }   /* space-separated RGB for /opacity */
```

**Stack for all three SPAs:** React 19 + Vite + TypeScript + TanStack Query +
TanStack Table + Zod schemas imported from `packages/shared-types` (shared with
the API, so contracts cannot drift).

---

## 2. `web-marketing` — Next.js 15, SSG/ISR

`school.techallways.com` · bilingual · **Lighthouse ≥ 95 mobile**

| Route | Purpose |
|---|---|
| `/` | Hero, the three free-tier features, social proof, pricing teaser |
| `/features` + `/features/[module]` | Per-module pages, SEO |
| `/pricing` | **Transparent public pricing + calculator.** Indian school ERP is quote-driven and opaque; publishing prices is itself a differentiator and filters out schools you'd waste time on |
| `/apaar` | **The free APAAR compliance tool landing page.** Highest-value GTM asset — externally-imposed deadline, urgent, gets you the roster |
| `/compare/teachmint`, `/compare/entab`, `/compare/excel` | High-intent, low-competition search queries |
| `/signup` | The wizard (`build/05`) |
| `/security` | DPDP posture, data portability, "we cannot see your student data" |
| `/academy` | Hindi/English how-to videos |
| `/[schoolSlug]` | **Per-school microsite** — free website for them, SEO surface for you |

Hero rule: no gradient mesh, no floating 3D blobs, no purple. A clean product
screenshot on `grey/25` with a single amber CTA. The design system's anti-brief
(`build/11` §2) applies to marketing more than anywhere else — it is the first
impression.

## 3. `web-admin` — the workhorse

`admin.school.techallways.com` · **Compact density** on all tables.

Layout: fixed 240px left sidebar (collapsible to 64px icons), 56px top bar with
school + branch + academic-session switchers, content area max-width 1440px.

Sidebar sections rendered from the same `navManifest` as the app:

```
Dashboard
Students      list · admissions · APAAR worklist · imports · certificates
Staff         list · assignments · attendance · leave · payroll
Academics     sessions · classes · subjects · timetable · substitutions
Attendance    daily overview · reports
Exams         exams · timetable · marks status · moderation · report cards
Fees          structures · invoices · collection · reconciliation · defaulters · daybook
Communication circulars · threads · surveys · gallery
Transport     routes · vehicles · live map · boarding · compliance
Safety        visitors · gate passes · incidents · pickup
Library       catalogue · digital books · loans
Compliance    UDISE export · APAAR · disclosure pack · documents
Settings      profile · branches · roles · users · feature toggles · billing
```

**38 routes.** Bulk/config work that is painful on a phone lives here: fee
structure design, timetable, report card templates, imports, role builder.

`DataTable` **virtualises above 100 rows** — a 900-student table must not render
900 DOM nodes. Column visibility, density toggle and filters persist to
localStorage per user per table.

## 4. `web-family` — the portal

`app.school.techallways.com` · **Non-optional in India.** Many parents will
never install an app; low storage, old devices, shared phones.

Mirrors `build/13` screens in a responsive two-column layout (sidebar nav on
desktop, bottom nav on mobile). Everything the app does except bus live-tracking
(link to the app for that) and offline book reading (streams instead).

## 5. `web-control` — internal

Per `build/10` §5. IP-restricted at Cloudflare. Same design language; this is
not an excuse for an unstyled admin panel.

---

## 6. Performance

- Route-level code splitting; the admin console must not ship the fee module to
  a teacher who never opens it
- TanStack Query `staleTime` mirroring the app's cache-first philosophy
  (5 min for lists, 1 hour for master data)
- Preload the session query at app boot; everything else on demand
- Images via Cloudflare Images or the `thumb`/`medium` variants — never originals
- Marketing site: static, zero client JS on content pages beyond the nav

## 7. Acceptance criteria

- [ ] All four deploy to Cloudflare Pages; none run on Oracle
- [ ] Marketing Lighthouse ≥ 95 mobile
- [ ] 900-row grids virtualised and smooth
- [ ] Family portal fully usable without installing the app
- [ ] Web and mobile are visually indistinguishable in component style
- [ ] Full Hindi UI on every surface
- [ ] Zero hardcoded colours outside `packages/ui/tailwind.config.ts`
