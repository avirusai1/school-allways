# School-Allways — Research, Problem Statements & Module Plan

**Version:** 0.1 (Discovery)
**Date:** 6 Aug 2026
**Target market:** India, K-12 private schools (CBSE / ICSE / State boards)
**Go-to-market:** 100% self-serve — school registers on landing page, onboards itself, goes live without sales touch
**Scale target:** Hundreds of schools, multi-tenant SaaS from day one
**Client stack:** Flutter (mobile) + web

---

## 0. TL;DR — What this document concludes

1. **Build 2 mobile apps, not 1 and not 5.**
   - `School-Allways Staff` — principal, admin, accounts, teachers, security, transport
   - `School-Allways Family` — unified parent + student login
   Reason: the two audiences have opposite update cadences, opposite Play Store review profiles, and completely different permission models. Merging them creates an app that's 3x the download size and leaks staff-only screens into parent devices. Splitting further (separate teacher app, separate security app) fragments your release process for no user benefit — role-based navigation inside the Staff app is enough.

2. **Web is the system-of-record UI; mobile is the daily-driver UI.** Bulk work (admissions import, fee structure setup, timetable generation, report card publishing, payroll) is web-only. Mobile does attendance, communication, approvals, payments, tracking.

3. **The self-serve wedge is not "ERP".** No principal signs up for a 30-module ERP on a landing page. The wedge is **free forever: attendance + communication + digital diary**, then paid upgrade to **fees + exams + transport**. This mirrors how Teachmint actually grew.

4. **Your compliance moat in 2026-27 is APAAR/UDISE+ and DPDP.** Every Indian school is being forced to link APAAR IDs Class 1–12 this session, and the DPDP Rules now make schools legally liable for children's data. Most incumbents bolt this on badly. Build it native.

5. **MVP = 9 modules, ~5 months.** Full catalog is 34 modules across 4 phases.

---

## 1. Market context

| Fact | Implication for us |
|---|---|
| Most Indian schools still run on **paper registers + Excel + WhatsApp groups** | Our competitor is not Entab. It's WhatsApp. Onboarding must beat WhatsApp on day 1, not on month 6. |
| Class WhatsApp groups hit 250 members / 500+ msgs a day; teachers get messages at 11 PM; parents' numbers exposed to each other; fee-fraud via cloned groups reported | Communication module must have **read receipts, one-way broadcast, quiet hours, and number masking** — these are the exact WhatsApp failures. |
| A class teacher loses **15–20 min/day** to manual attendance; ~7–10 productive hours/day lost across 30 classes | Attendance must take **under 20 seconds** on mobile, offline-capable. This is the single highest-leverage screen in the product. |
| School accountant spends **2–3 hrs/day** on fee registers, receipts, pending lists; an 800-student school has ₹15–40 L due per quarter | Fee module is where the money is (both theirs and ours). Reconciliation, not collection, is the real pain. |
| ERP failures are overwhelmingly **change-management failures**, not feature gaps — ~60% cite institutional readiness, ~54% cite staff resistance; botched data migration corrupts historical records | Self-serve onboarding must be *idiot-proof and reversible*. Import preview + rollback + sandbox mode are P0, not P2. |
| Common complaints about incumbents: ticket-only support (no phone) during fee/exam season; English-only UI; expensive on-prem hardware | Ours: in-app chat + callback, **Hindi/English toggle from v1** (regional langs later), zero on-prem. |

**Reference pricing signal:** Teachmint entry plans quoted around ₹1.5 L; most Indian SMS/ERP vendors price ₹15–60 per student per year for basics, more for transport/biometric add-ons. A self-serve model realistically needs a free tier + ₹40–120/student/year paid tiers, with fee-payment take-rate as a second revenue line.

---

## 2. Personas & their real problems

### 2.1 SCHOOL TEAM

#### Principal / Head of School
Runs on gut feel because data lives in five registers.

- No single view of "how is my school doing today" — attendance %, fee collected, staff present, incidents
- Cannot see class-wise or teacher-wise academic trends without asking someone to make a sheet
- Board/management asks for reports (UDISE+, mandatory disclosure, board affiliation renewal) and it becomes a 2-week fire drill
- Cannot tell which parents are unhappy until they're at the gate shouting
- Approvals (leave, expense, discount, TC) chase him on WhatsApp with no record
- Teacher performance is invisible — no data on syllabus coverage, marks entry timeliness, parent feedback
- Admission season is a black box: how many enquiries, where they dropped off, what conversion is
- Has no idea what the last vendor's data would look like if he ever switched

#### Admin / Front Office
The highest-volume, lowest-tooled role in the school.

- Admission enquiries arrive by phone, walk-in, Facebook, and a Google Form — no funnel
- Manual admission forms → data re-typed 3 times (register, Excel, board portal)
- **APAAR ID generation**: collecting physical Aadhaar consent forms from every parent, matching on UDISE+, chasing mismatches. Mandatory Class 1–12 for 2026–27 and required for CBSE Class 9/11 registration and Class 10/12 LOC. This is currently a nightmare done in a spreadsheet.
- UDISE+ annual data entry — hundreds of fields, re-keyed
- TC / bonafide / character certificate requests handled by hand
- Student records scattered: birth certificate here, caste cert there, photo missing
- Substitution management when a teacher takes leave — done on a whiteboard at 8:05 AM
- Circular distribution: print 900 copies or paste into 30 WhatsApp groups
- Inventory (books, uniforms, lab items) tracked in a notebook
- Visitor register is a physical book with illegible handwriting

#### Accounts / Finance
- **Reconciliation hell**: cash at counter + UPI + cheque + online gateway + bank transfer, matched by hand at month end
- Multiple collection points → duplicate receipts, missing entries
- Fee structure complexity: class-wise, term-wise, sibling discount, staff-ward concession, **RTE-quota exemptions**, SC/ST waivers, merit scholarships, late fee slabs, transport slab by distance, optional heads (lab, ECA, exam)
- Partial payments and adjustments break every spreadsheet
- Defaulter follow-up is manual and socially awkward; no professional automated ladder
- Refunds and TC-time settlements calculated manually
- Payroll: attendance → salary → PF/ESI/TDS → payslip, mostly in Tally + Excel with double entry
- Statutory: TDS returns, Form 16, GST on transport/uniform sales
- Vendor payments, petty cash, and no purchase-order trail
- Fee-regulation acts in several states (e.g. Maharashtra, Tamil Nadu, Rajasthan, UP) cap/regulate hikes and require documentation — no audit trail today

#### Teachers
The group that decides whether your product lives or dies.

- Attendance twice a day, on paper, then re-entered
- Marks entry into Excel → then into the report card format → then into board portal
- **Holistic Progress Card (NEP 2020 / CBSE HPC)** demands observations, portfolios, project work, self- and peer-assessment — massively more data capture per child than a marks table. Currently being done on printed templates.
- CBSE's two-attempt Class 10 model (from 2026) has created a near-continuous exam/evaluation cycle — more paperwork, not less
- Lesson plans and syllabus coverage tracking demanded by the coordinator, kept in a diary
- Homework posted to WhatsApp; no record of who saw it
- Parents message their **personal number** at 11 PM; their number stays on 600 phones forever, even after they leave the school
- Leave application on paper, approval by verbal nod
- Cannot see a child's full picture (attendance + marks + fee + discipline + health) in one place before a PTM
- Question paper creation from scratch every cycle
- CCE / internal assessment weightage arithmetic done manually

#### Security / Gate Team
Almost always ignored by ERPs — this is a genuine differentiation opportunity.

- Visitor entry in a paper register; no photo, no ID capture, no host verification
- Child handover at dismissal: parent ID cards are required in principle, forged/forgotten in practice. **Wrong-person pickup is the school's nightmare scenario.**
- No fast way to verify "is this adult authorised to take this child today"
- Late arrivals / early gate-pass exits not logged against the student record
- Staff attendance at gate, separate from HR system
- Emergency/lockdown has no broadcast mechanism
- CCTV exists (mandated, with 30–60 day retention expectations) but is not linked to any event log
- Vendor/contractor entry uncontrolled

#### Transport In-charge / Drivers
- Route planning and stop allocation done manually each April
- Parents call the driver directly to ask "where is the bus"
- **Regulatory pressure is rising**: GPS + CCTV in school buses pushed by CBSE and mandated in states like Maharashtra and UP, with panic buttons, seat belts, digital boarding/drop records, and parent-visible real-time tracking
- No boarding/de-boarding record → "my child never got off at the right stop" disputes
- Driver/attendant verification, licence expiry, fitness certificate expiry tracked nowhere
- Fuel and maintenance costs untracked per vehicle

### 2.2 END USERS

#### Parents
- **Anxiety, not features, is the product.** "Did my child reach? Are they in class? Are they okay?"
- Fee: unclear breakup, no history, no receipt, no reminder until a defaulter notice arrives; then confusion — "which fee?"
- Multiple children in the same school = multiple logins, multiple payments, multiple app installs
- App fatigue: separate apps for fees, transport, learning, communication
- Cheap phones with low storage; heavy apps get uninstalled
- Language barrier — many parents are not comfortable in English
- Information overload in WhatsApp groups; important circulars buried under Diwali greetings
- No visibility into homework, upcoming tests, syllabus, or PTM slots
- Cannot reach a teacher through a legitimate channel; either the personal number or nothing
- Leave application for the child is a handwritten note in a diary
- Privacy: their number visible to 250 strangers; fraud risk from cloned school groups
- Cannot compare "is my child improving" — only a term-end rank

#### Students (upper primary and above)
- Timetable, homework, and deadlines live on paper or in a parent's phone
- No consolidated view of their own attendance, marks, or feedback
- Study material and past papers not accessible
- Exam schedule and admit card distributed physically
- Library, lab, and club participation invisible
- Mental health / bullying reporting has no safe channel
- (Design constraint: **anyone under 18 is a "child" under the DPDP Act** — the student experience must run under a parent-consented account, with no behavioural tracking and no targeted advertising, ever.)

---

## 3. Regulatory & compliance requirements (build these in, don't bolt on)

| Requirement | What it forces into the product |
|---|---|
| **APAAR ID** — mandatory for all enrolled students Class 1–12 in AY 2026-27; needed for CBSE Class 9/11 registration and Class 10/12 LOC; linked to DigiLocker | APAAR field on every student record, bulk consent-form generation & tracking, UDISE+ matching helper, mismatch worklist, APAAR printed on ID cards |
| **UDISE+** annual data entry | Export in UDISE+ field format; keep the exact fields UDISE demands as first-class student/staff attributes |
| **DPDP Act 2023 + DPDP Rules 2025** — verifiable parental consent for under-18s; no behavioural tracking or targeted ads at children; purpose limitation; breach notification; consent withdrawal & erasure | Consent ledger per child, parent-verified onboarding (OTP + school-verified linkage, not a checkbox), data-retention policy engine, per-tenant data export/erasure, DPO contact, audit log on every PII read. **Also: the school is the Data Fiduciary and we are the Data Processor — DPA template must ship with signup.** |
| **CBSE / board affiliation & mandatory disclosure** | Auto-generated mandatory disclosure pack, staff qualification register, infrastructure register |
| **RTE 25% quota** | RTE student flag, fee exemption automation, separate reporting |
| **State fee regulation acts** | Fee structure versioning with effective dates, approval trail, hike documentation |
| **School bus safety norms** (CBSE guidance; state rules in MH/UP and others) — GPS, CCTV, panic button, seat belts, digital boarding records, parent-facing live tracking | Transport module must include live tracking, boarding/de-boarding scan log, driver document expiry alerts, panic/SOS |
| **CCTV retention** (30–60 days depending on state) | Incident log referencing timestamped footage; we store metadata, not video |
| **POSH / child safety committee** | Incident register with restricted access |
| **Payroll statutory** — PF, ESI, TDS, Form 16, professional tax | Payroll module with statutory outputs |

> ⚠️ These are moving targets and vary by state. Treat compliance as a **pluggable rule-pack per state/board**, versioned, so you can update without redeploying core.

---

## 4. App & surface architecture decision

### Recommendation: 2 mobile apps + 3 web surfaces

**Mobile — Flutter, single monorepo, shared design system & core packages**

| App | Users | Why separate |
|---|---|---|
| **School-Allways Staff** | Principal, Admin, Accounts, Teacher, Security, Transport in-charge, Driver | Role-based home screen after login. Internal audience, tolerant of frequent releases. Contains sensitive screens that must never ship to a parent device. |
| **School-Allways Family** | Parent + Student (unified login, profile switcher for multiple children) | Public-facing, review-sensitive, must stay small and fast on budget Android phones. Parent and student are the *same household* — merging them is correct; a student profile is just a restricted view under the parent's consent. |

**Why not one app for everyone:** permission-model complexity, download size, Play Store data-safety declarations differ (child data), and staff-only code paths on 50,000 parent devices is an unnecessary attack surface.

**Why not five apps:** security guard and driver need 2 screens each. A role-scoped shell inside the Staff app is far cheaper to ship and support. Revisit only if a role's usage pattern demands a dedicated kiosk build (likely candidate: a **Gate Kiosk** tablet build later — that one *is* worth splitting because it runs unattended in kiosk mode).

**Web surfaces**

1. **Marketing site + self-serve signup** (Next.js, SEO-critical, Hindi/English)
2. **School Web Console** — the real workhorse. Everything bulk/config: admissions, fee setup, timetable, exams & report cards, payroll, reports, settings
3. **Family Web Portal** — a light responsive mirror of the Family app, for parents on low-storage phones or desktops. *Non-optional in India.*
4. **Super-Admin Console (internal)** — tenant management, plan/billing, feature flags, support impersonation (audited), platform health

**Also plan for:** WhatsApp Business API as a *notification channel* (not a UI) — in India, delivery to parents without an app install is the difference between 40% and 95% reach.

---

## 5. Module catalog

Legend — **P0** = MVP, **P1** = fast-follow, **P2** = expansion, **P3** = later/differentiator

### A. Platform & Foundation

| # | Module | Priority | Notes |
|---|---|---|---|
| A1 | **Multi-tenancy & tenant provisioning** | P0 | Tenant = school (branch-aware from day 1: a group can have branches). Row-level isolation + per-tenant config. |
| A2 | **Self-serve onboarding wizard** | P0 | See §6 — this is the product's front door and must be world-class |
| A3 | **Identity, auth & RBAC** | P0 | Phone-OTP primary (India reality), email secondary. Roles: Super Admin, Principal, Admin, Accountant, Coordinator, Teacher, Security, Transport, Librarian, Parent, Student. Custom roles in P2. |
| A4 | **Academic session / calendar engine** | P0 | Sessions, terms, working days, holidays, year rollover & promotion — rollover is where competitors bleed customers |
| A5 | **Master data** | P0 | Classes, sections, subjects, streams, houses, buildings, rooms |
| A6 | **Notification & messaging infrastructure** | P0 | Push (FCM) + SMS (DLT-registered templates) + WhatsApp BSP + email + in-app. Quiet hours, delivery & read receipts, fallback chain. |
| A7 | **File & document store** | P0 | S3-compatible, per-tenant prefix, signed URLs, virus scan |
| A8 | **Audit log & activity trail** | P0 | Every PII read/write. Required for DPDP and for winning trust. |
| A9 | **Localisation (i18n)** | P0 | Hindi + English at launch; Marathi, Tamil, Telugu, Bengali, Gujarati, Kannada next |
| A10 | **Offline-first sync layer** | P0 | Attendance and marks entry must work with no network. Non-negotiable in tier-2/3. |
| A11 | **Billing & subscription (our revenue)** | P0 | Plans, per-student metering, trials, invoices, dunning, GST invoices |
| A12 | **Consent & privacy centre (DPDP)** | P0 | Consent ledger, withdrawal, data export, erasure, retention policies |
| A13 | **Feature flags & plan gating** | P1 | Sell modules independently, run staged rollouts |
| A14 | **Open API + webhooks** | P2 | Integrations, and an anti-lock-in selling point |
| A15 | **White-label / school branding** | P1 | Logo, colours, custom domain, app-icon-level branding at higher tiers |

### B. School Team — Academic & Operations

| # | Module | Priority | Notes |
|---|---|---|---|
| B1 | **Student Information System (SIS)** | P0 | The core record. Demographics, guardians, docs, medical, siblings, **APAAR/UDISE fields**, category/RTE flags, history |
| B2 | **Staff / HR records** | P0 | Profile, qualifications, documents, contracts, subject mapping |
| B3 | **Attendance — student** | P0 | Period-wise or daily, offline, <20s per class, auto-absentee alert to parent |
| B4 | **Attendance — staff** | P1 | Manual → biometric/geo-fence later |
| B5 | **Leave management** | P1 | Student leave (parent-initiated), staff leave, approval chain, leave balances |
| B6 | **Substitution & cover management** | P1 | Auto-suggest free teachers when someone is on leave — solves the 8:05 AM whiteboard |
| B7 | **Timetable engine** | P1 | Constraint-based generator + manual override; teacher/class/room clash detection |
| B8 | **Homework & digital diary** | P0 | Part of the free wedge. Attachments, due dates, seen-status, submission (optional) |
| B9 | **Lesson plan & syllabus coverage** | P2 | Coordinator visibility, % coverage vs planned |
| B10 | **Exams & assessments** | P1 | Exam scheme, grading systems (CBSE/ICSE/state), weightages, marks entry (offline), moderation, result processing |
| B11 | **Report cards + Holistic Progress Card (HPC)** | P1 | Template designer, board-compliant formats, NEP-aligned HPC with observations/portfolio/peer & self assessment, bulk PDF publish |
| B12 | **Question bank & paper generator** | P3 | Blueprint-based; strong AI candidate |
| B13 | **Certificates & TC** | P1 | TC, bonafide, character, custom templates, serial-numbered register |
| B14 | **Admissions & enquiry CRM** | P1 | Public enquiry form → funnel → online application + fee → entrance/interview → offer → enrolment. Big revenue lever for schools. |
| B15 | **Library management** | P2 | Catalogue, issue/return, fines, barcode |
| B16 | **Inventory, assets & procurement** | P2 | Books, uniforms, lab, PO → GRN → issue |
| B17 | **Hostel management** | P3 | Only if boarding schools become a segment |
| B18 | **Health & infirmary records** | P2 | Allergies, medication consent, clinic visits, immunisation |
| B19 | **Discipline & incident register** | P2 | Restricted access; POSH/child-safety cases separated with tighter ACL |
| B20 | **Co-curricular, houses & achievements** | P2 | Feeds the HPC |

### C. School Team — Finance

| # | Module | Priority | Notes |
|---|---|---|---|
| C1 | **Fee structure designer** | P0 | Class/term/head-wise, versioned with effective dates, optional heads, transport slabs, sibling/staff/RTE/SC-ST/merit concession rules, late-fee slabs, instalment plans |
| C2 | **Fee collection & receipts** | P0 | Online (UPI/cards/netbanking), counter cash/cheque/DD, partial payments, adjustments, auto-numbered receipts, refunds |
| C3 | **Reconciliation & daybook** | P0 | Gateway settlement vs bank vs ledger, auto-match, exception worklist. **This is the accountant's #1 pain — make it the flagship.** |
| C4 | **Defaulter management** | P0 | Ageing buckets, automated professional reminder ladder (app → WhatsApp → SMS → call list), promise-to-pay tracking |
| C5 | **Accounting & ledgers** | P2 | Chart of accounts, vouchers, trial balance, **Tally export** (Tally export is P1 — schools will not abandon Tally) |
| C6 | **Payroll** | P2 | Salary structures, attendance-linked, PF/ESI/TDS/PT, payslips, Form 16 |
| C7 | **Expenses, vendors & petty cash** | P2 | With approval chain |
| C8 | **Financial reports & budgets** | P1 | Collection vs projection, head-wise, class-wise, MIS for management |
| C9 | **Scholarships & concessions register** | P1 | Audit-ready record of every waiver — needed under fee regulation acts |

### D. School Team — Safety & Transport

| # | Module | Priority | Notes |
|---|---|---|---|
| D1 | **Gate & visitor management** | P1 | Visitor photo + ID + host approval + badge, pre-registered visitors via QR, vendor/contractor log |
| D2 | **Student handover / dismissal safety** | P1 | Authorised-pickup list per child with photos; QR/OTP handover; one-time delegate authorisation by parent from the app. **Strong differentiator — nobody does this well.** |
| D3 | **Gate pass & late arrival log** | P1 | Written back to the student attendance record |
| D4 | **Emergency broadcast & SOS** | P2 | Lockdown/fire/medical; instant push+SMS to all or to a zone |
| D5 | **Transport — routes, stops, vehicles** | P1 | Route builder, stop allocation, capacity, fee-slab linkage |
| D6 | **Transport — live tracking** | P1 | GPS device or driver-app based; parent-facing ETA; geofenced stop alerts |
| D7 | **Transport — boarding/de-boarding log** | P1 | RFID/QR scan at boarding; "boarded / alighted" push to parent. Regulatory + anxiety-solving. |
| D8 | **Driver & vehicle compliance** | P2 | Licence, PUC, fitness, insurance, permit expiry alerts; driver verification records |
| D9 | **CCTV & incident linkage** | P3 | Metadata + retention tracking, not video storage |

### E. School Team — Leadership & Insight

| # | Module | Priority | Notes |
|---|---|---|---|
| E1 | **Principal dashboard** | P0 (light) → P1 (full) | Today: attendance %, fees collected, staff present, open incidents, unread parent messages |
| E2 | **Analytics & reports library** | P1 | Academic trends, at-risk students, teacher activity, collection efficiency |
| E3 | **Approvals inbox** | P1 | Leave, discount, expense, TC, circular publishing — everything that currently happens on WhatsApp |
| E4 | **Compliance centre** | P1 | UDISE+ export, APAAR worklist, mandatory disclosure pack, affiliation document vault |
| E5 | **Early-warning / at-risk engine** | P3 | Attendance drop + marks drop + fee default + discipline → flag |
| E6 | **Parent sentiment & feedback** | P2 | PTM feedback, NPS, complaint tracker with SLA |

### F. Family (Parent + Student)

| # | Module | Priority | Notes |
|---|---|---|---|
| F1 | **Unified login + multi-child switcher** | P0 | One number, all children, across branches |
| F2 | **Home feed** | P0 | Today: attendance, homework, notices, fee due, bus status |
| F3 | **Communication inbox** | P0 | School broadcasts, class notices, teacher DMs (masked, logged, quiet-hours enforced), read receipts, translated |
| F4 | **Attendance view + leave request** | P0 | |
| F5 | **Homework & digital diary** | P0 | |
| F6 | **Fee payment** | P0 | Full breakup, history, receipts, pay-for-all-children in one transaction, instalments, auto-pay mandate (P2) |
| F7 | **Exam schedule, results & report card** | P1 | Downloadable PDF, trend over terms |
| F8 | **Bus live tracking + boarding alerts** | P1 | |
| F9 | **PTM slot booking** | P2 | Kills the biggest front-office phone-call driver |
| F10 | **Authorised pickup management** | P1 | Add/remove pickup persons, issue one-time pickup OTP |
| F11 | **Documents & certificates** | P2 | Download TC, bonafide, receipts, ID card |
| F12 | **Student self-view** | P1 | Own timetable, homework, marks, attendance — restricted, consent-scoped |
| F13 | **Study material & resources** | P2 | Teacher-shared notes, past papers |
| F14 | **Consent & privacy controls** | P0 | Parent sees exactly what data is held, grants/withdraws consent, exports it |
| F15 | **Safe reporting channel** | P3 | Bullying/wellbeing report routed to counsellor, restricted ACL |

### G. Internal / Business

| # | Module | Priority | Notes |
|---|---|---|---|
| G1 | **Super-admin tenant console** | P0 | |
| G2 | **Support & impersonation (audited)** | P0 | With in-app chat + callback request — beat the "ticket-only support" complaint |
| G3 | **Onboarding health & activation analytics** | P0 | Which schools stall at which wizard step — this *is* your growth loop |
| G4 | **In-app guidance, templates & academy** | P1 | Video micro-guides in Hindi/English; sample data; "invite your staff" nudges |
| G5 | **Referral & partner/reseller program** | P2 | How you actually get to hundreds of schools without a sales team |

**Total: 34 modules** (A×15, B×20, C×9, D×9, E×6, F×15, G×5 — grouped counts overlap; treat the tables as the source of truth).

---

## 6. Self-serve onboarding — the make-or-break flow

Given your goal (schools sign up autonomously from the landing page), this deserves as much design effort as the entire fee module.

### The funnel

```
Landing page (Hindi/EN, SEO + Google Ads)
   ↓
Sign up: principal's phone → OTP → school name, board, city, student count
   ↓  (< 60 seconds, no credit card, no sales call)
Tenant auto-provisioned + subdomain + sample data preloaded
   ↓
Guided setup wizard (progress bar, resumable, skippable)
   1. School profile, logo, address, board, affiliation no., UDISE code
   2. Academic session, terms, holidays
   3. Classes & sections  ← template by board, 1 click
   4. Subjects            ← template by board, 1 click
   5. Import staff        ← Excel/CSV, mapping UI, preview, validate, rollback
   6. Import students     ← same; or invite-link self-fill by parents
   7. Invite staff        ← SMS/WhatsApp deep links, bulk
   8. Invite parents      ← SMS/WhatsApp deep links, bulk
   9. Take first attendance  ← THE ACTIVATION EVENT
   ↓
Free tier live. Fees/exams/transport shown as locked upgrade cards.
   ↓
Self-serve upgrade → online payment → modules unlock instantly
```

### Non-negotiable design rules

- **Time-to-first-value under 30 minutes.** Measure it. It is your north-star onboarding metric.
- **Import is the killer.** Given that botched data migration is the #1 cause of ERP failure, build: template download → upload → **column auto-mapping** → row-level validation with human-readable errors → dry-run preview → commit → **one-click undo of the entire import batch**. Support the export formats of Entab, Teachmint, MyClassboard, Fedena and generic Excel.
- **Sample data + sandbox mode** so a principal can click around before committing real data. One button to wipe sample data.
- **Progressive disclosure.** Show 6 modules, not 34. Unlock as they're needed.
- **Every wizard step is resumable and re-orderable.** Nobody finishes in one sitting.
- **Parent self-fill option**: school imports just name + class + parent phone; the parent app collects the rest (address, photo, docs, Aadhaar consent for APAAR). Turns your biggest data-entry cost into a distributed task.
- **Automated activation nudges** — WhatsApp/SMS/email sequences triggered by where they stalled.
- **Human escape hatch**: "Request a callback" on every wizard step. Self-serve ≠ abandoned.
- **Free tier must be genuinely free forever** (attendance + communication + diary, capped features not capped students). This is your distribution engine; charging for the wedge kills the funnel.

### Pricing shape to validate

| Tier | Contents | Indicative |
|---|---|---|
| Free | Attendance, communication, digital diary, basic SIS | ₹0 |
| Standard | + Fees, exams & report cards, admissions, dashboards | ~₹40–70 /student/yr |
| Pro | + Transport & tracking, gate/safety, HR & payroll, library, analytics, white-label | ~₹90–150 /student/yr |
| Add-ons | SMS/WhatsApp credits, biometric devices, GPS devices, payment gateway MDR share | usage-based |

---

## 7. Recommended technical shape

*(Directional — to be finalised in the architecture doc.)*

- **Mobile:** Flutter, 2 apps, shared packages (`core_auth`, `core_network`, `design_system`, `sync_engine`). Offline via Drift/Isar + outbox queue. Target: APK under 25 MB for Family app.
- **Web:** Next.js (marketing + both consoles), shared component library with the Flutter design tokens.
- **Backend:** Modular monolith first (Node/NestJS or Go), not microservices. Split later only where load demands (notifications, tracking ingestion).
- **DB:** PostgreSQL, shared-schema multi-tenancy with `tenant_id` + row-level security. Per-tenant schema only for enterprise chains later.
- **Realtime/tracking:** separate ingestion path for GPS pings (time-series store), never in the main OLTP DB.
- **Payments:** Razorpay/Cashfree with route/split settlement, plus UPI autopay mandates.
- **Comms:** MSG91/Gupshup for DLT-compliant SMS + WhatsApp BSP; FCM for push.
- **Storage:** S3-compatible with per-tenant prefixes and signed URLs.
- **Data residency: India region only** — DPDP + procurement expectations.

---

## 8. Where incumbents leave a gap (our differentiation)

1. **True self-serve.** Entab, MyClassboard, Vidyalaya and most others are sales-led with implementation teams. Nobody has a genuinely good 30-minute self-onboarding for an Indian school.
2. **Reconciliation-first finance.** Everyone shows "fee collection". Almost nobody solves month-end matching across cash/UPI/gateway/bank.
3. **Safety layer.** Gate + authorised pickup + boarding scan + live bus, as one connected safety story, marketed to *parents*. This is the emotional buy.
4. **Native APAAR/UDISE+/DPDP compliance**, updated as a rule-pack when circulars change.
5. **Support that answers the phone** during fee and exam season.
6. **Bilingual by default**, not a bolted-on translation.
7. **Data portability as a feature** — one-click full export. Schools are terrified of lock-in because they've been burned.
8. **Teacher time-back framing**: "attendance in 20 seconds, report cards in one click, and your personal number stays private."

---

## 9. Proposed build phases

| Phase | Duration (indicative) | Modules | Goal |
|---|---|---|---|
| **P0 — MVP** | ~4–5 months | A1–A12, B1, B2, B3, B8, C1, C2, C3, C4, E1 (light), F1–F6, F14, G1–G3 | 5–10 pilot schools live, fully self-onboarded |
| **P1 — Commercial** | +3 months | A15, B5–B7, B10, B11, B13, B14, C5(Tally export), C8, C9, D1–D3, D5–D7, E2–E4, F7–F12, G4 | Paid tiers viable; safety + academics complete |
| **P2 — Scale** | +4 months | B9, B15, B16, B18–B20, C5–C7, D4, D8, E6, F13, G5 | Full ERP parity; reseller channel |
| **P3 — Differentiate** | ongoing | B12, B17, D9, E5, F15, AI layer | AI report-card drafting, at-risk prediction, question generation |

---

## 10. Open decisions for the next session

1. **Free-tier boundary** — exactly which features stay free forever?
2. **Payments**: do we take an MDR share on fee collection, or stay pure SaaS? (Materially changes the business model and the compliance burden.)
3. **Branch/chain support** in v1 or v2?
4. **iOS** — Flutter makes it cheap, but Play-first is right for India. Ship iOS in P1?
5. **WhatsApp BSP** from day one (cost: per-conversation) vs SMS only?
6. **Board coverage at launch** — CBSE only, or CBSE + ICSE + one state board?
7. **AI scope** — do we commit to AI report-card comments and HPC drafting as a launch differentiator, or keep it P3?
8. **Do we build the Gate Kiosk tablet app** in P1?

---

## Sources

- [Extramarks — School ERP for Indian Schools, complete guide 2026](https://www.extramarks.com/blogs/schools/school-erp-software-for-indian-schools-complete-guide-2026/)
- [Huvora — How to choose school management software India](https://huvoratechnologies.com/blog/how-to-choose-school-management-software-india.php)
- [Huvora — School fee management: reducing defaults](https://huvoratechnologies.com/blog/school-fee-management-reduce-defaults.php)
- [SoftwareWale — Why Indian schools are still running on WhatsApp groups](https://www.softwarewale.in/blogs/indian-schools-whatsapp-groups-cost-school-management-app)
- [eduTinker — Parent communication: why WhatsApp alone is not enough in 2026](https://edutinker.com/parent-communication-in-indian-schools-why-whatsapp-alone-is-not-enough-in-2026/)
- [Schoolites — Fee reconciliation challenges](https://schoolites.com/school-problems/fee-reconciliation-challenges)
- [Axoneura — Accounting software for schools in India](https://axoneura.in/blog/accounting-software-schools-india)
- [Careers360 — CBSE APAAR ID mandatory for LOC from 2026-27](https://news.careers360.com/cbse-board-exams-apaar-id-class-9-11-loc-registration-2026-27-two-level-10-maths-social-science-2028/amp)
- [EdPayU — APAAR ID: what principals need to know in 2026](https://edpayu.com/blog/apaar-id-abc-id-school-students-guide/)
- [UDISE+ student data entry guide](https://udise.net/udise-student-data-entry/)
- [King Stubb & Kasiva — Child data protection under DPDP Act](https://ksandk.com/data-protection-and-data-privacy/child-data-protection-under-dpdp-act-parental-consent-rules/)
- [King Stubb & Kasiva — DPDP compliance for EdTech & schools](https://ksandk.com/data-protection-and-data-privacy/dpdp-act-compliance-for-edtech-schools/)
- [ORF — DPDP Rules and the future of child data safety](https://www.orfonline.org/expert-speak/dpdp-rules-and-the-future-of-child-data-safety)
- [Wikipedia — Digital Personal Data Protection Rules, 2025](https://en.wikipedia.org/wiki/Digital_Personal_Data_Protection_Rules,_2025)
- [MyClassboard — CBSE makes GPS & CCTV compulsory in school buses](https://www.myclassboard.com/blog/cbse-makes-gps-cctv-compulsory-school-buses/)
- [Free Press Journal — Maharashtra makes CCTV, GPS, seat belts mandatory](https://www.freepressjournal.in/education/maharashtra-regulates-school-bus-fares-for-first-time-makes-cctv-gps-and-seat-belts-mandatory)
- [Telematics Wire — UP mandates CCTV in school buses](https://telematicswire.net/up-mandates-cctv-in-school-buses/)
- [Careers360 — CBSE two-exam Class 10: teacher burden](https://news.careers360.com/cbse-board-exam-2026-class-10-12-two-chance-date-sheet-school-teachers-double-burden-students-anxiety-subject-marks-syllabus-nep/amp)
- [ClassOnApp — Holistic Progress Card for CBSE schools](https://classonapp.com/resources/latest-update/holistic-progress-card-hpc-for-cbse-indian-schools-school-report-card-software)
- [Academia ERP — Top 10 reasons education ERPs fail](https://www.academiaerp.com/blog/top-10-reasons-education-erps-fail-how-to-prevent-them/)
- [LearnQoch — Overcoming top ERP implementation challenges in schools](https://learnqoch.com/top-erp-implementation-challenges-schools/)
- [IITMS — Data migration challenges during ERP implementation](https://www.iitms.co.in/blog/data-migration-challenges-during-erp-implementation.html)
- [Classegy — Top 10 school management systems in India 2026](https://classegy.com/resources/top-10-school-management-systems-india-2026-reviews)
- [SoftwareSuggest — Teachmint pricing and features](https://www.softwaresuggest.com/teachmint)
</content>
