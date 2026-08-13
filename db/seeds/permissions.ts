/**
 * The permission catalogue.
 *
 * FORMAT: `<area>.<resource>.<action>`  e.g. `attendance.student.mark`
 *
 * Three fields matter beyond the code:
 *
 *  - moduleCode  : maps to the module catalogue in docs/01+02. Plan gating
 *                  (A13) works off this, so a "Free" school simply doesn't
 *                  get permissions whose module isn't in their plan.
 *
 *  - sensitivity : `restricted` permissions need a record_access_grant ON TOP
 *                  of the role permission, and every read writes a
 *                  pii_access_log row. This is what keeps the Principal out
 *                  of counselling notes.
 *
 *  - scopes      : which scope types are LEGAL. `students.record.read` may be
 *                  granted at tenant/branch/section/self. `fee.structure.manage`
 *                  may only ever be branch or tenant — never section. Assigning
 *                  an illegal scope is rejected at role-assignment time.
 */

export type PermissionSeed = {
  code: string;
  moduleCode: string;
  resource: string;
  action: string;
  description: string;
  sensitivity?: 'normal' | 'confidential' | 'restricted';
  scopes?: Array<'tenant' | 'branch' | 'section' | 'subject' | 'self'>;
};

/** Widest → narrowest. Already includes `self`; do not spread `...ALL, 'self'`. */
const ALL = ['tenant', 'branch', 'section', 'self'] as const;
const BRANCHY = ['tenant', 'branch'] as const;
/** For permissions a family member exercises over their own child. */
const BRANCHY_OR_SELF = ['tenant', 'branch', 'self'] as const;

/** Compact helper: p('attendance.student.mark','B3','Mark attendance') */
function p(
  code: string,
  moduleCode: string,
  description: string,
  opts: Partial<PermissionSeed> = {},
): PermissionSeed {
  const parts = code.split('.');
  return {
    code,
    moduleCode,
    resource: parts.slice(0, -1).join('.'),
    action: parts[parts.length - 1],
    description,
    sensitivity: opts.sensitivity ?? 'normal',
    scopes: (opts.scopes ?? [...BRANCHY]) as PermissionSeed['scopes'],
  };
}

export const PERMISSIONS: PermissionSeed[] = [
  // -------------------------------------------------------------------------
  // Platform & administration
  // -------------------------------------------------------------------------
  p('tenant.settings.read', 'A1', 'View school settings'),
  p('tenant.settings.manage', 'A1', 'Change school settings'),
  p('tenant.branch.read', 'A1', 'View branches'),
  p('tenant.branch.manage', 'A1', 'Create and edit branches', { scopes: ['tenant'] }),
  p('tenant.billing.read', 'A11', 'View subscription and invoices', { scopes: ['tenant'] }),
  p('tenant.billing.manage', 'A11', 'Change plan, pay platform invoices', { scopes: ['tenant'] }),
  p('subscription.student.read', 'A11', 'List students with parent-subscription status'),
  p('subscription.manual.activate', 'A11', 'Activate a parent subscription after collecting cash'),
  p('tenant.branding.manage', 'A15', 'Logo, colours, custom domain', { scopes: ['tenant'] }),
  p('tenant.onboarding.manage', 'A2', 'Run the setup wizard, import data'),

  p('rbac.role.read', 'A3', 'View roles and permissions'),
  p('rbac.role.manage', 'A3', 'Create and edit custom roles'),
  p('rbac.assignment.read', 'A3', 'View who holds which role'),
  p('rbac.assignment.manage', 'A3', 'Assign and revoke roles'),

  p('audit.log.read', 'A8', 'View the audit trail', { sensitivity: 'confidential' }),
  p('audit.pii.read', 'A8', 'View who accessed personal data', { sensitivity: 'confidential' }),

  p('privacy.consent.read', 'A12', 'View consent records', {
    sensitivity: 'confidential',
    scopes: [...BRANCHY_OR_SELF],
  }),
  p('privacy.consent.manage', 'A12', 'Record and withdraw consent', {
    sensitivity: 'confidential',
    scopes: [...BRANCHY_OR_SELF],
  }),
  p('privacy.request.handle', 'A12', 'Process access/export/erasure requests', {
    sensitivity: 'confidential',
  }),

  p('device.integration.manage', 'A16', 'Configure biometric, RFID and GPS devices'),
  p('document.esign.apply', 'A17', 'Apply a digital signature', { scopes: ['tenant', 'branch'] }),
  p('print.bulk.run', 'A18', 'Run bulk print and PDF jobs'),

  // -------------------------------------------------------------------------
  // Academic structure
  // -------------------------------------------------------------------------
  p('academic.session.read', 'A4', 'View academic sessions and calendar'),
  p('academic.session.manage', 'A4', 'Create sessions, terms, holidays'),
  p('academic.session.rollover', 'A4', 'Promote students to the next session', {
    scopes: ['tenant', 'branch'],
  }),
  p('academic.master.read', 'A5', 'View classes, sections, subjects'),
  p('academic.master.manage', 'A5', 'Create classes, sections, subjects'),

  p('timetable.read', 'B7', 'View timetable', { scopes: [...ALL] }),
  p('timetable.manage', 'B7', 'Create and edit timetable'),
  p('substitution.read', 'B6', 'View substitutions', { scopes: [...ALL] }),
  p('substitution.manage', 'B6', 'Assign substitute teachers'),

  // -------------------------------------------------------------------------
  // Students & staff
  // -------------------------------------------------------------------------
  p('student.record.read', 'B1', 'View student records', { scopes: [...ALL] }),
  p('student.record.manage', 'B1', 'Create and edit student records'),
  p('student.record.delete', 'B1', 'Delete a student record', { scopes: ['tenant', 'branch'] }),
  p('student.document.read', 'B1', 'View student documents', {
    sensitivity: 'confidential',
    scopes: [...ALL],
  }),
  p('student.document.manage', 'B1', 'Upload and verify student documents', {
    sensitivity: 'confidential',
  }),
  p('student.guardian.manage', 'B1', 'Manage guardian links and permissions'),
  p('student.apaar.manage', 'E4', 'Manage APAAR IDs and UDISE data'),
  p('student.import.run', 'A2', 'Bulk import students'),

  p('staff.record.read', 'B2', 'View staff records', { scopes: [...ALL] }),
  p('staff.record.manage', 'B2', 'Create and edit staff records'),
  p('staff.account.issue', 'B2', 'Issue email/password login for a staff member'),
  p('staff.salary.read', 'C6', 'View salary details', { sensitivity: 'confidential' }),
  p('staff.document.read', 'B2', 'View staff documents', { sensitivity: 'confidential' }),

  p('guardian.account.issue', 'B1', 'Issue email/password login for a guardian'),
  p('guardian.account.issue.bulk', 'B1', 'Bulk-issue guardian login credentials at the front desk'),

  // -------------------------------------------------------------------------
  // Attendance
  // -------------------------------------------------------------------------
  p('attendance.student.read', 'B3', 'View student attendance', { scopes: [...ALL] }),
  p('attendance.student.mark', 'B3', 'Mark student attendance', {
    scopes: ['tenant', 'branch', 'section'],
  }),
  p('attendance.student.amend', 'B3', 'Change locked attendance', {
    scopes: ['tenant', 'branch'],
  }),
  p('attendance.staff.read', 'B4', 'View staff attendance', { scopes: [...ALL] }),
  p('attendance.staff.mark', 'B4', 'Mark staff attendance'),

  p('leave.request.create', 'B5', 'Apply for leave', { scopes: ['self', 'section', 'branch'] }),
  p('leave.request.read', 'B5', 'View leave requests', { scopes: [...ALL] }),
  p('leave.request.approve', 'B5', 'Approve or reject leave', {
    scopes: ['tenant', 'branch', 'section'],
  }),

  // -------------------------------------------------------------------------
  // Teaching & learning
  // -------------------------------------------------------------------------
  p('homework.read', 'B8', 'View homework', { scopes: [...ALL] }),
  p('homework.manage', 'B8', 'Create and edit homework', {
    scopes: ['tenant', 'branch', 'section'],
  }),
  p('homework.grade', 'B8', 'Grade homework submissions', {
    scopes: ['tenant', 'branch', 'section'],
  }),
  p('diary.read', 'B8', 'View the digital diary', { scopes: [...ALL] }),
  p('diary.manage', 'B8', 'Write diary entries', { scopes: ['tenant', 'branch', 'section'] }),
  p('lessonplan.read', 'B9', 'View lesson plans', { scopes: [...ALL] }),
  p('lessonplan.manage', 'B9', 'Create lesson plans', { scopes: ['branch', 'section'] }),
  p('lessonplan.approve', 'B9', 'Approve lesson plans'),

  p('book.read', 'B31', 'Read digital books', { scopes: [...ALL] }),
  // Section-legal: a subject teacher uploading notes for their own classes is
  // the common case, and must not require branch-wide book rights.
  p('book.manage', 'B31', 'Upload and publish digital books', {
    scopes: ['tenant', 'branch', 'section'],
  }),
  p('library.item.read', 'B15', 'Search the library catalogue', { scopes: [...ALL] }),
  p('library.item.manage', 'B15', 'Manage the library catalogue'),
  p('library.loan.manage', 'B15', 'Issue and return books'),

  // -------------------------------------------------------------------------
  // Exams & assessment
  // -------------------------------------------------------------------------
  p('exam.read', 'B10', 'View exams and exam timetable', { scopes: [...ALL] }),
  p('exam.manage', 'B10', 'Create exams and exam timetable'),
  p('exam.marks.read', 'B10', 'View marks', { scopes: [...ALL] }),
  p('exam.marks.enter', 'B10', 'Enter marks', {
    scopes: ['tenant', 'branch', 'section', 'subject'],
  }),
  p('exam.marks.moderate', 'B10', 'Moderate submitted marks'),
  p('exam.result.publish', 'B10', 'Publish results to parents'),
  p('reportcard.read', 'B11', 'View report cards', { scopes: [...ALL] }),
  p('reportcard.manage', 'B11', 'Generate and publish report cards'),
  p('reportcard.template.manage', 'B11', 'Design report card templates'),
  p('hpc.read', 'B11', 'View Holistic Progress Card', { scopes: [...ALL] }),
  p('hpc.assess', 'B11', 'Record HPC observations', {
    scopes: ['tenant', 'branch', 'section', 'self'],
  }),

  // -------------------------------------------------------------------------
  // Finance
  // -------------------------------------------------------------------------
  p('fee.structure.read', 'C1', 'View fee structures'),
  p('fee.structure.manage', 'C1', 'Create and edit fee structures'),
  p('fee.structure.approve', 'C1', 'Approve a fee structure or hike'),
  p('fee.invoice.read', 'C2', 'View fee invoices', { scopes: [...ALL] }),
  p('fee.invoice.manage', 'C2', 'Generate and adjust invoices'),
  /**
   * YOUR DECISION #2 — subject teachers can see fee status.
   * Deliberately a SEPARATE, narrower permission than fee.invoice.read:
   * it exposes only {status, amount due, ageing bucket}. A teacher must
   * never see payment history, instrument details or bank references.
   */
  p('fee.status.read', 'C2', 'View fee status summary only (no payment detail)', {
    scopes: [...ALL],
  }),
  p('fee.payment.collect', 'C2', 'Collect a payment and issue a receipt'),
  p('fee.payment.refund', 'C2', 'Issue a refund'),
  p('fee.reconcile.manage', 'C3', 'Reconcile payments against bank settlements'),
  p('fee.defaulter.read', 'C4', 'View the defaulter list', { scopes: [...ALL] }),
  p('fee.defaulter.followup', 'C4', 'Send reminders and log promises to pay'),
  p('fee.concession.read', 'C9', 'View concessions and scholarships'),
  p('fee.concession.manage', 'C9', 'Grant concessions'),
  p('fee.concession.approve', 'C9', 'Approve concessions'),

  p('accounting.ledger.read', 'C5', 'View ledgers and vouchers'),
  p('accounting.ledger.manage', 'C5', 'Post vouchers, export to Tally'),
  p('payroll.read', 'C6', 'View payroll', { sensitivity: 'confidential' }),
  p('payroll.manage', 'C6', 'Run payroll', { sensitivity: 'confidential' }),
  p('payroll.approve', 'C6', 'Approve a payroll run', { sensitivity: 'confidential' }),
  p('expense.read', 'C7', 'View expenses and vendor payments'),
  p('expense.manage', 'C7', 'Record expenses'),
  p('expense.approve', 'C7', 'Approve expenses'),
  p('finance.report.read', 'C8', 'View financial reports'),

  p('store.item.manage', 'C11', 'Manage book and uniform stock'),
  p('store.sale.record', 'C11', 'Record a store sale'),
  p('canteen.wallet.manage', 'C10', 'Manage canteen wallets'),

  // -------------------------------------------------------------------------
  // Admissions
  // -------------------------------------------------------------------------
  p('admission.enquiry.read', 'B14', 'View admission enquiries'),
  p('admission.enquiry.manage', 'B14', 'Create and progress enquiries'),
  p('admission.application.manage', 'B14', 'Process applications and offers'),
  p('admission.report.read', 'B14', 'View the admissions funnel'),

  p('certificate.read', 'B13', 'View issued certificates', { scopes: [...ALL] }),
  p('certificate.issue', 'B13', 'Issue TC, bonafide and other certificates'),
  p('certificate.approve', 'B13', 'Approve certificate issuance'),

  // -------------------------------------------------------------------------
  // Communication
  // -------------------------------------------------------------------------
  p('comms.announcement.read', 'A6', 'View announcements', { scopes: [...ALL] }),
  p('comms.announcement.create', 'A6', 'Draft announcements', {
    scopes: ['tenant', 'branch', 'section'],
  }),
  p('comms.announcement.publish', 'A6', 'Publish announcements to an audience'),
  p('comms.announcement.approve', 'A6', 'Approve announcements before sending'),
  p('comms.message.send', 'F3', 'Send messages in a thread', { scopes: [...ALL] }),
  p('comms.thread.read', 'F3', 'View message threads', { scopes: [...ALL] }),
  p('comms.emergency.broadcast', 'D4', 'Send an emergency broadcast'),
  p('comms.delivery.read', 'A6', 'View delivery and read receipts'),
  p('notification.inbox.read', 'A6', 'View own in-app notifications', { scopes: ['self'] }),

  p('survey.read', 'B27', 'View surveys', { scopes: [...ALL] }),
  p('survey.manage', 'B27', 'Create surveys and consent forms'),
  p('survey.respond', 'B27', 'Respond to a survey', { scopes: ['self'] }),
  p('gallery.read', 'B28', 'View photo gallery', { scopes: [...ALL] }),
  p('gallery.manage', 'B28', 'Upload and publish gallery albums'),

  // -------------------------------------------------------------------------
  // Safety & transport
  // -------------------------------------------------------------------------
  p('gate.visitor.read', 'D1', 'View the visitor log'),
  p('gate.visitor.manage', 'D1', 'Check visitors in and out'),
  p('gate.pass.manage', 'D3', 'Issue gate passes'),
  p('pickup.authorisation.read', 'D2', 'View authorised pickup persons', { scopes: [...ALL] }),
  p('pickup.authorisation.manage', 'D2', 'Add or revoke authorised pickup persons', {
    scopes: ['tenant', 'branch', 'self'],
  }),
  p('pickup.handover.record', 'D2', 'Record a child handover at dismissal'),
  p('pickup.handover.override', 'D2', 'Override pickup verification (alerts the principal)', {
    sensitivity: 'confidential',
  }),

  p('incident.read', 'B19', 'View incidents', { sensitivity: 'confidential', scopes: [...ALL] }),
  p('incident.manage', 'B19', 'Record and resolve incidents', { sensitivity: 'confidential' }),
  /**
   * RESTRICTED TIER. Holding this is NOT sufficient — a record_access_grant is
   * also required, and every read is written to pii_access_logs.
   * Your decision #5: the Principal gets the indicator permission, not this one.
   */
  p('counselling.note.read', 'B25', 'Read counselling and IEP notes', {
    sensitivity: 'restricted',
    scopes: ['self', 'section'],
  }),
  p('counselling.note.manage', 'B25', 'Write counselling and IEP notes', {
    sensitivity: 'restricted',
    scopes: ['self'],
  }),
  p('counselling.case.indicator', 'B25', 'See only that a case is open or closed', {
    sensitivity: 'confidential',
    scopes: [...ALL],
  }),
  p('safereport.read', 'F15', 'Read student safe-reports', {
    sensitivity: 'restricted',
    scopes: ['self', 'branch'],
  }),
  p('safereport.create', 'F15', 'Submit a safe-report', { scopes: ['self'] }),

  p('health.record.read', 'B18', 'View health records', {
    sensitivity: 'confidential',
    scopes: [...ALL],
  }),
  p('health.record.manage', 'B18', 'Record clinic visits and medical info', {
    sensitivity: 'confidential',
  }),

  p('transport.route.read', 'D5', 'View routes and stops', { scopes: [...ALL] }),
  p('transport.route.manage', 'D5', 'Create routes, stops and allocations'),
  p('transport.tracking.read', 'D6', 'View live bus location', { scopes: [...ALL] }),
  p('transport.trip.operate', 'D7', 'Start a trip and scan boarding', {
    scopes: ['tenant', 'branch', 'self'],
  }),
  p('transport.boarding.read', 'D7', 'View boarding logs', { scopes: [...ALL] }),
  p('transport.vehicle.manage', 'D8', 'Manage vehicles and compliance documents'),
  p('transport.sos.raise', 'D4', 'Raise an SOS from a vehicle', { scopes: ['self', 'branch'] }),

  // -------------------------------------------------------------------------
  // Leadership & insight
  // -------------------------------------------------------------------------
  p('dashboard.principal.read', 'E1', 'View the leadership dashboard'),
  p('analytics.report.read', 'E2', 'View analytics and reports', { scopes: [...ALL] }),
  p('approval.inbox.read', 'E3', 'View the approvals inbox', { scopes: [...ALL] }),
  p('compliance.centre.read', 'E4', 'View the compliance centre'),
  p('compliance.export.run', 'E4', 'Run UDISE+ and statutory exports'),
  p('atrisk.read', 'E5', 'View at-risk student flags', {
    sensitivity: 'confidential',
    scopes: [...ALL],
  }),
  p('feedback.read', 'E6', 'View parent feedback and NPS'),
  p('helpdesk.ticket.read', 'G6', 'View parent complaints', { scopes: [...ALL] }),
  p('helpdesk.ticket.manage', 'G6', 'Handle parent complaints or raise your own', {
    scopes: [...BRANCHY_OR_SELF],
  }),

  p('task.read', 'B30', 'View assigned tasks', { scopes: [...ALL] }),
  p('task.manage', 'B30', 'Assign tasks to staff'),
  p('meeting.read', 'B29', 'View meetings and minutes', { scopes: [...ALL] }),
  p('meeting.manage', 'B29', 'Schedule meetings and record minutes'),
  p('event.read', 'B21', 'View school events', { scopes: [...ALL] }),
  p('event.manage', 'B21', 'Create events and consent forms'),
  p('idcard.manage', 'B22', 'Generate ID cards'),

  // -------------------------------------------------------------------------
  // Family-side
  // -------------------------------------------------------------------------
  p('family.child.read', 'F1', 'View own children', { scopes: ['self'] }),
  p('family.fee.pay', 'F6', 'Pay fees online', { scopes: ['self'] }),
  p('family.leave.request', 'F4', 'Request leave for own child', { scopes: ['self'] }),
  p('family.ptm.book', 'F9', 'Book a PTM slot', { scopes: ['self'] }),
  p('family.consent.manage', 'F14', 'Grant or withdraw consent for own child', {
    sensitivity: 'confidential',
    scopes: ['self'],
  }),
  p('family.data.request', 'F14', 'Request data access, export or erasure', { scopes: ['self'] }),
  // The other half of the invitation's promise: "Parents will be asked to add
  // their child's address and photo." Self scope only — a parent edits their
  // own children's contact details and nobody else's.
  p('family.child.profile.manage', 'F1', "Complete own child's profile details", {
    scopes: ['self'],
  }),
  p('student.self.read', 'F12', 'View own timetable, marks, attendance', { scopes: ['self'] }),
];

/** Sanity: duplicate codes are a seeding bug, not a runtime surprise. */
export function assertNoDuplicates(): void {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const perm of PERMISSIONS) {
    if (seen.has(perm.code)) dupes.push(perm.code);
    seen.add(perm.code);
  }
  if (dupes.length) {
    throw new Error(`Duplicate permission codes: ${dupes.join(', ')}`);
  }
}
