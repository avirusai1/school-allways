# School All Ways — User Types, Roles & Module Access Matrix

**Version:** 0.2 (supersedes §4 and §5 of `01-research-and-modules.md`)
**Date:** 6 Aug 2026

---

## 0. Product naming (locked)

| Surface | Name | Users |
|---|---|---|
| Mobile app — family | **School All Ways** | Parents, Guardians, Students |
| Mobile app — school | **School All Ways Admin** | All school staff (role-based home screen) |
| Web — family portal | **School All Ways Web** | Parents, Guardians, Students |
| Web — school console | **School All Ways Admin Console** | All school staff (bulk/config work lives here) |
| Web — internal | **All Ways Control** | Our platform team only |
| Public site | schoolallways.com | Signup / marketing |

Package IDs: `com.schoolallways.family` and `com.schoolallways.admin`.

---

## 1. Gap analysis — what v1 missed

I re-audited against a full Indian K-12 school's operations. **18 modules were missing.** Adding them now:

| # | Module | Domain | Why it matters | Priority |
|---|---|---|---|---|
| A16 | **Device integration hub** | Platform | Biometric attendance machines, RFID/NFC readers, GPS trackers, barcode scanners, thermal receipt/ID printers. Every school already owns some of these. | P1 |
| A17 | **Digital signature & e-sign** | Platform | TC, report cards, salary certificates, consent forms need a principal's signature. Today: print → sign → scan. | P2 |
| A18 | **Bulk print & PDF service** | Platform | 900 report cards, 900 ID cards, 900 receipts. Needs a proper queued render service, not a browser print. | P1 |
| B21 | **Events & school calendar** | Academic | Annual day, sports day, field trips, competitions — with **digital parental consent forms** (currently paper slips that get lost) | P2 |
| B22 | **ID card & credential generation** | Academic | Photo + QR/RFID + **APAAR ID printed on card (now required)**; links to gate, library, canteen, bus | P1 |
| B23 | **Online exams & quizzes** | Academic | MCQ tests, practice papers, auto-grading | P3 |
| B24 | **LMS / content & video lessons** | Academic | Teacher-uploaded content, recorded classes | P3 |
| B25 | **Counselling & special education (IEP)** | Academic | Special educator caseload, IEP goals, session notes. **Highest-sensitivity data in the school** — needs its own ACL tier. | P2 |
| B26 | **Alumni management** | Academic | Records, donations, events | P3 |
| B27 | **Surveys, polls & feedback forms** | Academic | PTM feedback, consent collection, option-subject selection, NPS | P2 |
| B28 | **Gallery & school newsfeed** | Academic | Event photos to parents. Sounds trivial; it's the #1 driver of daily parent app-opens. | P2 |
| B29 | **Meetings & minutes (MoM)** | Ops | Staff meetings, SMC, PTA, POSH committee, safety committee — several are statutorily required to be minuted | P3 |
| B30 | **Staff task & to-do assignment** | Ops | Principal → staff tasks with due dates. Replaces the other half of WhatsApp. | P2 |
| C10 | **Canteen wallet & POS** | Finance | Prepaid wallet on the student ID card; parents control spend and see what was bought | P3 |
| C11 | **Store — books & uniform sales** | Finance | Real revenue centre for schools, currently a cash notebook. GST applies. | P2 |
| C12 | **Govt. scholarship & scheme tracking** | Finance | NSP, state scholarships, minority schemes — schools must file and track these | P3 |
| H1–H4 | **HR suite** (recruitment/ATS, appraisal & PMS, training & PD records, staff onboarding/exit) | HR | v1 only had staff records + payroll. Teacher hiring, appraisal and CPD are real annual workflows. | P2–P3 |
| G6 | **Parent helpdesk & complaint SLA** | Business | Ticketed complaints with an SLA clock, visible to the principal. Turns angry gate confrontations into tracked tickets. | P2 |

**Revised total: 52 modules.**

Two more things v1 under-specified that I'd call out:

- **Class Teacher vs Subject Teacher are different roles**, not one "Teacher". A class teacher owns attendance, report cards, parent relationships and discipline for one section; a subject teacher enters marks for many sections and owns nothing else. Modelling them as one role is a classic ERP mistake that leads to either over-permissioning or teacher frustration.
- **Data scope matters as much as permission.** "Teacher can view students" is meaningless — it must be "*their assigned sections only*". The matrix below encodes scope, not just yes/no.

---

## 2. Complete user type list

### 2.1 School All Ways Admin (staff app + console) — 26 roles

| # | Role | Cluster | Primary surface | Typical count in an 800-student school |
|---|---|---|---|---|
| 1 | Group / Trust Owner | Leadership | Console | 1 (multi-branch only) |
| 2 | Principal | Leadership | App + Console | 1 |
| 3 | Vice Principal | Leadership | App + Console | 1–2 |
| 4 | Academic Coordinator / HOD / Section Head | Coordination | App + Console | 3–6 |
| 5 | Exam Controller | Coordination | Console | 1 |
| 6 | School Admin (tenant super-user) | Admin | Console | 1–2 |
| 7 | Front Office / Receptionist | Admin | Console | 1–3 |
| 8 | MIS / Data Operator | Admin | Console | 1 |
| 9 | Admissions Counsellor | Admissions | App + Console | 1–3 |
| 10 | Accounts Head / Finance Manager | Finance | Console | 1 |
| 11 | Fee Counter Clerk / Cashier | Finance | Console | 1–3 |
| 12 | HR Manager | HR | Console | 1 |
| 13 | Payroll Officer | HR | Console | 1 |
| 14 | **Class Teacher** | Teaching | App | ~30 |
| 15 | **Subject Teacher** | Teaching | App | ~40 |
| 16 | Co-curricular Staff (sports, music, art) | Teaching | App | 5–8 |
| 17 | Special Educator / Counsellor | Teaching | App | 1–2 |
| 18 | Substitute / Visiting Teacher | Teaching | App | variable |
| 19 | Librarian | Support | Console | 1 |
| 20 | Lab In-charge / Assistant | Support | App | 2–4 |
| 21 | School Nurse / Infirmary | Support | App | 1 |
| 22 | Store / Inventory Keeper | Support | Console | 1 |
| 23 | Security Head | Safety | App + Console | 1 |
| 24 | Security Guard (gate) | Safety | App / Kiosk | 2–6 |
| 25 | Transport In-charge | Transport | App + Console | 1 |
| 26 | Driver / Bus Attendant | Transport | App (minimal) | 10–20 |

*Optional 27th:* **IT Admin** — the school's own tech person. In most schools this is the School Admin; expose as a separate role only for large chains.

### 2.2 School All Ways (family app + web) — 4 roles

| # | Role | Notes |
|---|---|---|
| 27 | **Primary Parent / Guardian** | Account owner. Holds DPDP consent for the child. Multi-child, multi-branch switcher. |
| 28 | **Secondary Guardian** | Second parent, own login, linked by primary. Configurable: can they pay fees? approve leave? |
| 29 | **Authorised Pickup Person** | Grandparent, driver, relative. **No full login** — receives a one-time QR/OTP issued by the parent. Deliberately minimal. |
| 30 | **Student** | Age-gated view under parental consent. Under-18 = "child" under DPDP: no behavioural tracking, no ads, ever. |

*Future:* **Alumni** (P3, read-only + events).

### 2.3 All Ways Control (internal) — 3 roles

| # | Role |
|---|---|
| 31 | Platform Super Admin |
| 32 | Support Agent (audited impersonation, time-boxed) |
| 33 | Billing / Finance Ops |

---

## 3. Access legend

| Symbol | Meaning |
|---|---|
| **F** | Full — configure, create, edit, delete |
| **M** | Manage — create & edit within own scope |
| **E** | Enter — data entry only, cannot configure or delete |
| **A** | Approve — review and approve/reject others' submissions |
| **V** | View only |
| **v** | View, **own scope only** (own sections / own children / own record) |
| **–** | No access |

---

## 4. Master matrix — Modules × Role clusters

Role clusters: **LEAD** (Owner, Principal, VP) · **COORD** (Coordinator/HOD, Exam Controller) · **ADMIN** (School Admin, Front Office, MIS) · **ADMSN** (Admissions) · **FIN** (Accounts, Cashier) · **HR** (HR Mgr, Payroll) · **CT** (Class Teacher) · **ST** (Subject Teacher) · **SUPP** (Librarian, Lab, Nurse, Store) · **SAFE** (Security Head, Guard) · **TRAN** (Transport, Driver) · **PAR** (Parent) · **STU** (Student)

### A. Platform & Foundation

| Module | LEAD | COORD | ADMIN | ADMSN | FIN | HR | CT | ST | SUPP | SAFE | TRAN | PAR | STU |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A1 Multi-tenancy / branches | F | – | V | – | – | – | – | – | – | – | – | – | – |
| A2 Onboarding wizard | F | – | F | – | – | – | – | – | – | – | – | – | – |
| A3 Identity & RBAC | F | – | F | – | – | V | – | – | – | – | – | – | – |
| A4 Session & calendar | F | M | F | – | V | V | v | v | V | V | V | V | V |
| A5 Master data | F | M | F | – | – | – | V | V | V | – | – | – | – |
| A6 Notification infra | F | M | F | M | M | – | v | v | – | M | M | – | – |
| A7 File & document store | F | M | F | M | M | M | v | v | v | v | v | v | v |
| A8 Audit log | V | – | V | – | v | – | – | – | – | – | – | v | – |
| A9 Localisation | F | – | F | – | – | – | v | v | v | v | v | v | v |
| A10 Offline sync | – | – | – | – | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| A11 Billing (our SaaS) | F | – | V | – | V | – | – | – | – | – | – | – | – |
| A12 Consent & privacy centre | F | – | F | – | – | – | v | – | – | – | – | **F** | v |
| A13 Feature flags | V | – | V | – | – | – | – | – | – | – | – | – | – |
| A14 Open API / webhooks | F | – | F | – | – | – | – | – | – | – | – | – | – |
| A15 White-label branding | F | – | F | – | – | – | – | – | – | – | – | – | – |
| A16 **Device integration hub** | V | – | F | – | V | V | – | – | V | M | M | – | – |
| A17 **Digital signature** | **F** | A | M | – | M | M | – | – | – | – | – | – | – |
| A18 **Bulk print & PDF** | V | M | F | M | M | M | v | – | v | – | – | – | – |

> A12 is the one row where **Parent has more power than the Principal** — by law. The parent grants, withdraws, exports and erases their child's data.

### B. Academic & Operations

| Module | LEAD | COORD | ADMIN | ADMSN | FIN | HR | CT | ST | SUPP | SAFE | TRAN | PAR | STU |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| B1 Student Information System | F | V | F | M | v | – | v | v | v | v | v | v | v |
| B2 Staff records | V | v | M | – | v | **F** | v | v | v | v | v | – | – |
| B3 Student attendance | V | V | M | – | V | – | **M** | E | – | E | – | v | v |
| B4 Staff attendance | V | V | M | – | V | **F** | v | v | v | E | v | – | – |
| B5 Leave management | **A** | A | M | – | – | F | A/v | v | v | v | v | **M** | – |
| B6 Substitution & cover | A | **F** | M | – | – | – | v | v | – | – | – | – | – |
| B7 Timetable engine | V | **F** | M | – | – | – | v | v | – | – | – | v | v |
| B8 Homework & digital diary | V | V | – | – | – | – | **M** | **M** | – | – | – | v | v |
| B9 Lesson plan & syllabus coverage | V | **A** | – | – | – | – | M | M | – | – | – | – | – |
| B10 Exams & assessments | V | **F** | M | – | – | – | M | **E** | – | – | – | v | v |
| B11 Report cards & HPC | A | **F** | M | – | – | – | **M** | E | v | – | – | v | v |
| B12 Question bank & papers | V | M | – | – | – | – | M | **M** | – | – | – | – | – |
| B13 Certificates & TC | **A** | V | **F** | – | A | – | v | – | – | – | – | v | v |
| B14 Admissions CRM | V | V | M | **F** | M | – | – | – | – | – | – | – | – |
| B15 Library | V | V | V | – | – | – | v | v | **F** | – | – | v | v |
| B16 Inventory & procurement | A | V | M | – | A | – | – | – | **F** | – | V | – | – |
| B17 Hostel | V | – | M | – | V | – | – | – | M | V | – | v | v |
| B18 Health & infirmary | V | v | M | – | – | – | v | – | **F** | – | – | v | – |
| B19 Discipline & incidents | **F** | M | V | – | – | – | M | E | – | M | – | v | – |
| B20 Co-curricular & achievements | V | M | M | – | – | – | M | M | **M** | – | – | v | v |
| B21 **Events & consent forms** | A | **F** | M | – | V | – | M | v | v | V | V | **A** | v |
| B22 **ID cards & credentials** | V | – | **F** | M | – | M | v | – | v | V | V | v | v |
| B23 **Online exams & quizzes** | V | M | – | – | – | – | M | **M** | – | – | – | v | **v** |
| B24 **LMS / content** | V | M | – | – | – | – | M | **M** | – | – | – | v | **v** |
| B25 **Counselling & IEP** 🔒 | V | – | – | – | – | – | v | – | **F** | – | – | v | – |
| B26 **Alumni** | V | – | **M** | M | V | – | – | – | – | – | – | – | – |
| B27 **Surveys & feedback** | **F** | M | M | M | – | M | M | v | – | – | – | **E** | E |
| B28 **Gallery & newsfeed** | A | M | **M** | – | – | – | M | M | – | – | – | v | v |
| B29 **Meetings & MoM** | **F** | M | M | – | V | M | v | v | v | v | v | – | – |
| B30 **Staff tasks** | **F** | M | M | M | M | M | v | v | v | v | v | – | – |

> 🔒 B25 (Counselling/IEP) is deliberately invisible to Coordinators, Admin and Subject Teachers. Only the Special Educator, Principal (view), the Class Teacher (own students, limited) and the parent see it.

### C. Finance

| Module | LEAD | COORD | ADMIN | ADMSN | FIN | HR | CT | ST | SUPP | SAFE | TRAN | PAR | STU |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C1 Fee structure designer | **A** | – | V | V | **F** | – | – | – | – | – | V | – | – |
| C2 Fee collection & receipts | V | – | V | M | **F** | – | – | – | – | – | – | **M** | – |
| C3 Reconciliation & daybook | V | – | – | – | **F** | – | – | – | – | – | – | – | – |
| C4 Defaulter management | V | – | V | – | **F** | – | v | – | – | – | – | v | – |
| C5 Accounting & Tally export | V | – | – | – | **F** | V | – | – | – | – | – | – | – |
| C6 Payroll | **A** | – | – | – | M | **F** | v | v | v | v | v | – | – |
| C7 Expenses & vendors | **A** | M | M | – | **F** | M | – | – | M | M | M | – | – |
| C8 Financial reports | **V** | – | V | – | **F** | V | – | – | – | – | – | – | – |
| C9 Scholarships & concessions | **A** | – | V | M | **F** | – | – | – | – | – | – | v | – |
| C10 **Canteen wallet & POS** | V | – | V | – | **M** | – | – | – | **E** | – | – | **M** | v |
| C11 **Books & uniform store** | V | – | V | – | **M** | – | – | – | **F** | – | – | **M** | – |
| C12 **Govt. scholarship tracking** | V | – | **M** | – | M | – | v | – | – | – | – | v | – |

### D. Safety & Transport

| Module | LEAD | COORD | ADMIN | ADMSN | FIN | HR | CT | ST | SUPP | SAFE | TRAN | PAR | STU |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| D1 Gate & visitor management | V | – | M | V | – | – | v | – | – | **F** | – | v | – |
| D2 **Student handover / pickup** | V | V | M | – | – | – | **v** | – | – | **F** | v | **M** | – |
| D3 Gate pass & late arrival | V | V | M | – | – | – | v | – | – | **M** | – | v | – |
| D4 Emergency broadcast & SOS | **F** | M | M | – | – | – | E | E | E | **M** | **E** | v | v |
| D5 Transport routes & stops | V | – | V | V | V | – | – | – | – | V | **F** | v | v |
| D6 Transport live tracking | V | – | V | – | – | – | – | – | – | V | **F** | **v** | v |
| D7 Boarding / de-boarding log | V | – | V | – | – | – | v | – | – | V | **M** | **v** | – |
| D8 Driver & vehicle compliance | A | – | V | – | V | M | – | – | – | V | **F** | – | – |
| D9 CCTV & incident linkage | **V** | – | – | – | – | – | – | – | – | **M** | – | – | – |

> **Driver / Bus Attendant** is the narrowest role in the system: start route, scan boarding, SOS. Three screens. Nothing else.

### E. Leadership & Insight

| Module | LEAD | COORD | ADMIN | ADMSN | FIN | HR | CT | ST | SUPP | SAFE | TRAN | PAR | STU |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E1 Principal dashboard | **F** | v | V | v | v | v | – | – | – | v | v | – | – |
| E2 Analytics & reports | **F** | v | V | v | v | v | v | v | – | – | – | – | – |
| E3 Approvals inbox | **F** | M | M | – | M | M | v | v | v | v | v | – | – |
| E4 Compliance centre (UDISE/APAAR) | **A** | V | **F** | M | V | V | v | – | – | – | – | v | – |
| E5 At-risk early warning | **V** | V | – | – | V | – | **v** | – | v | – | – | – | – |
| E6 Parent sentiment & NPS | **F** | V | V | – | – | – | v | – | – | – | – | E | – |

### F. Family modules (School All Ways app/web)

| Module | Parent | Secondary Guardian | Pickup Person | Student |
|---|---|---|---|---|
| F1 Unified login + child switcher | **F** | M | – | v |
| F2 Home feed | **V** | V | – | V |
| F3 Communication inbox | **F** | M | – | v (school broadcasts only) |
| F4 Attendance view + leave request | **M** | M | – | v |
| F5 Homework & diary | V | V | – | **V** |
| F6 Fee payment | **F** | configurable | – | – |
| F7 Exam schedule, results, report card | V | V | – | **V** |
| F8 Bus tracking + boarding alerts | **V** | V | – | v |
| F9 PTM slot booking | **M** | M | – | – |
| F10 Authorised pickup management | **F** | V | v (own QR) | – |
| F11 Documents & certificates | **V** | V | – | v |
| F12 Student self-view | – | – | – | **V** |
| F13 Study material | V | V | – | **V** |
| F14 Consent & privacy controls | **F** | V | – | – |
| F15 Safe reporting channel 🔒 | v | – | – | **M** |
| F16 **Events & consent forms** | **A** | A | – | v |
| F17 **Gallery & newsfeed** | **V** | V | – | V |
| F18 **Canteen wallet** | **F** | V | – | v (balance only) |
| F19 **Store — books & uniform** | **M** | M | – | – |
| F20 **Helpdesk / raise a complaint** | **M** | M | – | – |
| F21 **Surveys & feedback** | **E** | E | – | E |

> 🔒 F15 is the one module a **student can use without the parent seeing the content**. A bullying or wellbeing report routes to the counsellor, not the parent inbox. This needs an explicit legal/ethical decision from you before build — see open decisions.

### G. Internal (All Ways Control)

| Module | Super Admin | Support Agent | Billing Ops |
|---|---|---|---|
| G1 Tenant console | F | V | V |
| G2 Impersonation (audited, time-boxed) | F | **M** | – |
| G3 Onboarding & activation analytics | F | V | V |
| G4 In-app guidance & academy | F | M | – |
| G5 Referral & reseller program | F | V | **M** |
| G6 **Parent helpdesk & SLA** | F | **M** | – |

---

## 5. Per-role quick reference — what each person actually opens

Condensed to the modules a role touches **daily or weekly**. This is what drives their app home screen.

| Role | Home screen shows | Module count |
|---|---|---|
| **Principal** | Dashboard, approvals inbox, incidents, broadcast, compliance alerts | ~20 (mostly view) |
| **Vice Principal** | Approvals, substitutions, discipline, attendance exceptions | ~15 |
| **Coordinator / HOD** | Syllabus coverage, marks-entry status, timetable, substitutions, lesson plans | ~12 |
| **Exam Controller** | Exam scheme, marks status, moderation, result processing, report cards | ~6 |
| **School Admin** | Student/staff records, certificates, circulars, APAAR/UDISE worklist, ID cards | ~25 |
| **Front Office** | Visitor log, enquiries, certificate requests, gate passes, calls | ~8 |
| **MIS Operator** | Compliance centre, imports, APAAR matching, UDISE export | ~5 |
| **Admissions** | Enquiry funnel, applications, tests, offers, conversion dashboard | ~6 |
| **Accounts Head** | Reconciliation, collection dashboard, defaulters, ledgers, reports | ~12 |
| **Cashier** | Collect fee, print receipt, daybook close | ~4 |
| **HR Manager** | Staff records, leave, attendance, recruitment, appraisal | ~10 |
| **Payroll Officer** | Payroll run, statutory, payslips | ~4 |
| **Class Teacher** | **Attendance, homework, diary, my class, report card, parent messages** | ~14 |
| **Subject Teacher** | **Attendance (period), marks entry, homework, content** | ~8 |
| **Special Educator** | IEP caseload, session notes, health flags | ~5 |
| **Librarian** | Issue/return, catalogue, fines | ~3 |
| **Nurse** | Clinic visits, allergies, medication consent | ~3 |
| **Store Keeper** | Inventory, indents, uniform/book sales | ~4 |
| **Security Head** | Visitor log, pickup queue, gate passes, incidents, SOS | ~8 |
| **Security Guard** | **Scan visitor, verify pickup, log gate pass, SOS** | **4** |
| **Transport In-charge** | Live map, routes, boarding exceptions, vehicle compliance | ~9 |
| **Driver / Attendant** | **Start route, scan boarding, SOS** | **3** |
| **Parent** | **Attendance, fees, homework, notices, bus, gallery** | ~21 |
| **Student** | **Timetable, homework, marks, material** | ~10 |

---

## 6. Design consequences of this matrix

1. **The Staff app is really five apps in a trench coat.** A guard's build and a principal's build share almost nothing. Solve with a **role-driven navigation manifest** fetched at login — the server tells the client which tabs to render. Never hardcode role→screen mapping in the Flutter app; you'll ship a release for every permission tweak.

2. **Scope is enforced server-side, always.** `v` (own scope) rows are the ones that leak. A subject teacher requesting another section's marks must get a 403 from the API, not a hidden button in the UI.

3. **Three modules need an ACL tier above normal RBAC:** B19 Discipline, B25 Counselling/IEP, F15 Safe reporting. Add a `sensitive` classification with per-record access grants and mandatory audit logging on read.

4. **One person holds many roles.** A real school has a teacher who is also a class teacher, a house master and the exam coordinator. **Roles must be multi-assignable per user per session**, with permissions unioned. Single-role-per-user is the second classic ERP modelling mistake.

5. **Roles are scoped to a branch and an academic session.** "Class teacher of 5B" expires on 31 March. Build role assignment as a time-bounded, branch-bounded grant, not a flag on the user.

6. **Guard and Driver need a lightweight build.** Consider a `--dart-define` lite flavour, or make the Family app small enough that Staff app size stops mattering. Guards often use the school's shared low-end phone.

---

## 7. New open decisions this raises

1. **Custom roles in v1?** Schools will ask ("our Sports Head needs X"). Config-driven custom roles is a week of work now vs. a rewrite later. My call: ship 26 fixed roles, but build the permission model as data from day one.
2. **Can a Subject Teacher see fee status of their students?** Most schools say yes so teachers can nudge; most parents would say no. I lean **no** — teachers should never be fee collectors.
3. **F15 safe reporting** — does a student's wellbeing report stay hidden from the parent? Legally and ethically loaded. Needs your explicit decision.
4. **Secondary Guardian payment rights** — default on or off?
5. **Does the Principal get raw access to B25 counselling notes,** or only a "case open/closed" indicator? I recommend the latter.
6. **Multi-branch role scoping** — needed in v1, or is single-school-per-tenant fine to start?

---

*Supersedes §4–5 of `01-research-and-modules.md`. Module numbering is continuous across both documents.*
</content>
