# 04 — Communication, Homework, Notifications

**Depends on:** 01, 02. **This is the module that replaces WhatsApp.**

The competitor is a class group with 250 members and 500 messages a day, where
teachers get messages at 11 PM, parents' numbers are exposed to strangers, and
fraudsters have impersonated teachers in cloned groups to extract fake fee
payments. We win on three things WhatsApp structurally cannot do:
**read receipts · number masking · quiet hours.**

---

## PART A — Notification infrastructure (`modules/notifications/`)

### The fallback ladder — implement exactly

```
attempt 0: push (FCM) + in_app                       always, free
           ↓ wait SMS_ESCALATION_MINUTES (45)
if read_at IS NOT NULL       → status='suppressed', STOP    ← money saved
if priority < 'high'         → STOP
if tenant daily SMS cap hit  → status='suppressed', warn admin, STOP
           ↓
attempt 1: whatsapp if configured, else sms
           ↓
attempt 2: (fee reminders only) add to the office call list
```

Careless fan-out costs ~₹9,600/month at 10 schools. Every `suppressed` row is
money you didn't spend — surface that number to yourself in the platform console.

### Quiet hours

Default 21:00–07:00 IST, per-tenant overridable. Non-critical sends inside the
window are deferred to its end. **`critical` bypasses** — emergency broadcast
and transport SOS always go through. Nothing else may.

### DLT (India)

Every transactional SMS needs a registered template id. If
`notification_templates.dltTemplateId` is null, **fail the send loudly and alert
ops** — never silently downgrade to push, or you'll discover in month three that
no absence alerts went out.

### Batching

A 900-parent circular is **one job** that inserts `delivery_attempts` in chunks
of 500 and pushes FCM in multicast batches of 500. Never one job per recipient.

### API

```ts
notificationService.notify({
  tenantId, templateCode: 'STUDENT_ABSENT',
  recipients: [{ userId, studentId }],   // or an audience descriptor
  variables: { studentName: 'Aarav', date: '10 Aug' },
  priority: 'high',
  channels: ['push', 'in_app'],          // escalation adds sms/whatsapp
  scheduledFor: null,
});
```
Enqueues and returns in < 20 ms. **Zero provider I/O in the request path.**

---

## PART B — Announcements (`modules/communication/`)

```
GET  /v1/announcements?type=&unread=true          scoped feed, keyset
POST /v1/announcements                            draft
POST /v1/announcements/:id/publish
POST /v1/announcements/:id/acknowledge            parent taps "I have read this"
GET  /v1/announcements/:id/delivery               who read it ← the WhatsApp killer
```

**Publish request:**
```jsonc
{ "type": "circular", "priority": "normal",
  "title": "Annual Day rehearsal schedule",
  "body": "...",
  "audienceType": "class",
  "audienceRefs": { "classIds": ["uuid"] },
  "channels": ["push", "in_app"],
  "requiresAcknowledgement": true,
  "scheduledFor": null }
```

**Delivery response:**
```jsonc
{ "recipientCount": 412, "deliveredCount": 408, "readCount": 331,
  "acknowledgedCount": 298,
  "unreadRecipients": [ { "studentName": "Aarav Sharma", "guardianName": "…",
                          "sectionLabel": "5-A" } ] }
```

**Perf:** counters come from the denormalised columns on `announcements`, never
a `COUNT` over `delivery_attempts` — that is the largest table in the system.

**Approval:** when `tenant_settings['comms.require_approval']` is set, a
teacher's announcement enters `pending` and lands in the principal's approvals
inbox.

**Audience resolution runs in a job**, not the request — a whole-school circular
is 1,800 guardians.

---

## PART C — Threads (masked messaging)

```
GET  /v1/threads?studentId=
POST /v1/threads                { studentId, participantUserIds[], subject }
GET  /v1/threads/:id/messages   keyset on (threadId, createdAt)
POST /v1/threads/:id/messages
POST /v1/threads/:id/read
```

**Masking.** `thread_participants.displayAs` holds what the *other* side sees:

- Parent sees `"Ms. Sharma · Class Teacher, 5-A"`
- Teacher sees `"Parent of Aarav Sharma (5-A)"`

**No phone number appears in any thread or message DTO, in either direction.**
Write an explicit test asserting it. Teachers' personal numbers ending up on 600
parents' phones forever is the exact pain we are removing.

Outside quiet hours the composer shows: *"Messages sent now will be delivered at
7:00 AM."*

---

## PART D — Homework & diary (`modules/homework/`)

```
GET  /v1/homework?sectionId=&status=          teacher view
GET  /v1/homework/feed?studentId=             parent view, all children
POST /v1/homework
POST /v1/homework/:id/seen                    sets seenAt
POST /v1/homework/:id/submit
POST /v1/homework/:id/grade
GET  /v1/diary?studentId=&from=&to=
POST /v1/diary
```

**Seen-status is the differentiator.** On publish, bulk-create a
`homework_submissions` stub for every student in the section (ONE insert) so
"27 of 40 have seen this" works even when `requiresSubmission` is false.

**Parent feed for N children is ONE query** with `inArray(studentIds)`, never N
queries. Cache 5 min, bust on write.

Diary entries with `feedsHpc = true` flow into the Holistic Progress Card
(`build/07`) — design the write path with that in mind.

---

## Acceptance criteria

- [ ] A read push suppresses SMS escalation and the row records `suppressed`
- [ ] Quiet hours defer non-critical, never critical
- [ ] Missing DLT template fails loudly, never silently downgrades
- [ ] 1,800-recipient circular = one job, chunked, request returns immediately
- [ ] Delivery stats come from counters, never a live COUNT
- [ ] No phone number in any thread/message response, either direction
- [ ] Publishing homework to 40 students creates 40 stubs in one insert
- [ ] Parent feed for 3 children is a single query
- [ ] A subject teacher can only post homework to sections they teach
