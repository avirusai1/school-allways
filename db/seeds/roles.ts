/**
 * The 26 system roles (+ family and platform roles).
 *
 * These seed with `tenant_id = NULL`, meaning they are shared by every school.
 * A school can CLONE one into a custom role but cannot delete or rename it.
 *
 * TWO FIELDS DO REAL WORK AT RUNTIME
 * ----------------------------------
 * `defaultScope` — the scope a permission is granted at when this role is
 *   assigned. A Subject Teacher gets `section`, so `exam.marks.enter` resolves
 *   to *their* sections only. Getting this wrong is how ERPs leak data.
 *
 * `nav` — the server-driven navigation manifest. The Flutter client renders
 *   whatever the server sends at login. Never hardcode role→screen mapping in
 *   the app, or every permission tweak becomes a Play Store release.
 *
 * PERMISSION SYNTAX
 *   'exact.permission.code'   grant that one
 *   'fee.*'                   grant every permission starting with 'fee.'
 *   '!fee.payment.refund'     subtract (applied after wildcards)
 */

export type ScopeType = 'tenant' | 'branch' | 'section' | 'subject' | 'self';

export type RoleSeed = {
  code: string;
  name: string;
  description: string;
  cluster:
    | 'leadership' | 'coordination' | 'admin' | 'admissions' | 'finance'
    | 'hr' | 'teaching' | 'support' | 'safety' | 'transport'
    | 'family' | 'platform';
  appTarget: 'admin' | 'family' | 'control';
  defaultScope: ScopeType;
  homeScreen: string;
  nav: string[];
  permissions: string[];
};

export const SYSTEM_ROLES: RoleSeed[] = [
  // ==========================================================================
  // LEADERSHIP
  // ==========================================================================
  {
    code: 'group_owner',
    name: 'Group / Trust Owner',
    description: 'Owner of a multi-branch school group. Sees every branch.',
    cluster: 'leadership',
    appTarget: 'admin',
    defaultScope: 'tenant',
    homeScreen: 'group_dashboard',
    nav: ['group_dashboard', 'branches', 'finance_reports', 'approvals', 'billing', 'settings'],
    permissions: [
      'tenant.*', 'rbac.*', 'dashboard.*', 'analytics.*', 'approval.*',
      'notification.inbox.read',
      'finance.report.read', 'fee.structure.approve', 'payroll.approve',
      'expense.approve', 'audit.log.read', 'compliance.*',
      'academic.session.read', 'academic.master.read',
      'student.record.read', 'staff.record.read',
      // Deliberately NOT counselling.note.read — see decision #5.
      'counselling.case.indicator',
    ],
  },
  {
    code: 'principal',
    name: 'Principal',
    description: 'Head of a school. Broad read, approval authority, no data entry.',
    cluster: 'leadership',
    appTarget: 'admin',
    defaultScope: 'branch',
    homeScreen: 'principal_dashboard',
    nav: [
      'principal_dashboard', 'approvals', 'attendance_overview', 'academics',
      'finance_summary', 'communication', 'incidents', 'compliance', 'staff',
      'staff_attendance', 'settings',
    ],
    permissions: [
      'dashboard.*', 'analytics.*', 'approval.*',
      'tenant.settings.*', 'rbac.*',
      'academic.*', 'timetable.*', 'substitution.*',
      'student.record.read', 'student.document.read', 'student.apaar.manage',
      'staff.record.*', 'staff.document.read', 'staff.salary.read',
      'attendance.*', 'leave.request.read', 'leave.request.approve',
      'exam.*', 'reportcard.*', 'hpc.read',
      'fee.structure.*', 'fee.invoice.read', 'fee.defaulter.read',
      'fee.concession.approve', 'fee.concession.read', 'finance.report.read',
      'payroll.read', 'payroll.approve', 'expense.approve', 'expense.read',
      'comms.*', 'survey.*', 'gallery.*',
      'incident.*', 'gate.visitor.read', 'pickup.authorisation.read',
      'transport.route.read', 'transport.tracking.read', 'transport.boarding.read',
      'certificate.*', 'admission.*', 'compliance.*',
      'audit.log.read', 'audit.pii.read', 'privacy.*',
      'atrisk.read', 'feedback.read', 'helpdesk.*',
      'task.*', 'meeting.*', 'event.*', 'idcard.manage', 'book.*', 'library.*',
      'health.record.read', 'document.esign.apply', 'print.bulk.run',
      // Indicator only. NOT the notes themselves.
      'counselling.case.indicator',
      '!counselling.note.read', '!counselling.note.manage',
      '!safereport.read',
    ],
  },
  {
    code: 'vice_principal',
    name: 'Vice Principal',
    description: 'Deputy head. Day-to-day operations and discipline.',
    cluster: 'leadership',
    appTarget: 'admin',
    defaultScope: 'branch',
    homeScreen: 'principal_dashboard',
    nav: [
      'principal_dashboard', 'approvals', 'substitutions', 'attendance_overview',
      'staff_attendance', 'incidents', 'communication',
    ],
    permissions: [
      'dashboard.*', 'analytics.report.read', 'approval.*',
      'academic.session.read', 'academic.master.read',
      'timetable.*', 'substitution.*',
      'student.record.read', 'staff.record.read',
      'attendance.*', 'leave.request.read', 'leave.request.approve',
      'exam.read', 'exam.marks.read', 'reportcard.read',
      'comms.announcement.*', 'comms.thread.read', 'comms.emergency.broadcast',
      'incident.*', 'task.*', 'event.*', 'gallery.manage',
      'counselling.case.indicator',
      'fee.status.read',
    ],
  },

  // ==========================================================================
  // COORDINATION
  // ==========================================================================
  {
    code: 'academic_coordinator',
    name: 'Academic Coordinator / HOD',
    description: 'Owns syllabus coverage, timetable and marks-entry progress for a stage or department.',
    cluster: 'coordination',
    appTarget: 'admin',
    defaultScope: 'branch',
    homeScreen: 'coordinator_dashboard',
    nav: [
      'coordinator_dashboard', 'approvals', 'syllabus_coverage', 'timetable',
      'marks_status', 'substitutions', 'lesson_plans',
    ],
    permissions: [
      'academic.session.read', 'academic.master.*',
      'timetable.*', 'substitution.*',
      'lessonplan.*',
      'student.record.read', 'staff.record.read',
      'attendance.student.read', 'attendance.staff.read',
      'leave.request.read', 'leave.request.approve',
      'exam.*', 'reportcard.*', 'hpc.*',
      'homework.read', 'diary.read', 'book.*',
      'comms.announcement.create', 'comms.announcement.read', 'comms.thread.read',
      'analytics.report.read', 'approval.inbox.read',
      'survey.manage', 'survey.read', 'event.manage', 'event.read',
      'task.read', 'meeting.read',
      '!exam.result.publish',
    ],
  },
  {
    code: 'exam_controller',
    name: 'Exam Controller',
    description: 'Owns the exam cycle end to end: scheme, timetable, moderation, results.',
    cluster: 'coordination',
    appTarget: 'admin',
    defaultScope: 'branch',
    homeScreen: 'exam_dashboard',
    nav: ['exam_dashboard', 'exams', 'exam_timetable', 'marks_status', 'moderation', 'report_cards'],
    permissions: [
      'exam.*', 'reportcard.*', 'hpc.read',
      'academic.master.read', 'academic.session.read',
      'student.record.read', 'staff.record.read',
      'attendance.student.read',
      'comms.announcement.create', 'comms.announcement.read',
      'print.bulk.run', 'analytics.report.read',
    ],
  },

  // ==========================================================================
  // ADMIN
  // ==========================================================================
  {
    code: 'school_admin',
    name: 'School Admin',
    description: 'Tenant super-user. Everything except restricted clinical data.',
    cluster: 'admin',
    appTarget: 'admin',
    defaultScope: 'branch',
    homeScreen: 'admin_dashboard',
    nav: [
      'admin_dashboard', 'approvals', 'students', 'students.subscriptions', 'staff', 'staff_attendance',
      'academics', 'fees', 'communication', 'compliance', 'settings', 'roles',
    ],
    permissions: [
      'tenant.*', 'rbac.*', 'academic.*', 'timetable.*', 'substitution.*',
      'notification.inbox.read',
      'subscription.student.read', 'subscription.manual.activate',
      'student.*', 'staff.record.*', 'staff.document.read',
      'staff.account.issue', 'guardian.account.issue',
      'attendance.*', 'leave.*',
      'homework.read', 'diary.read', 'exam.*', 'reportcard.*', 'hpc.read',
      'fee.*', 'admission.*', 'certificate.*',
      'comms.*', 'survey.*', 'gallery.*',
      'gate.*', 'pickup.authorisation.*', 'incident.read', 'incident.manage',
      'transport.*', 'library.*', 'book.*', 'store.*',
      'compliance.*', 'audit.*', 'privacy.*',
      'device.integration.manage', 'print.bulk.run', 'idcard.manage',
      'task.*', 'meeting.*', 'event.*', 'helpdesk.*',
      'dashboard.principal.read', 'analytics.report.read', 'approval.inbox.read',
      '!counselling.note.read', '!counselling.note.manage', '!safereport.read',
      '!payroll.manage', '!payroll.approve',
      // Family-only permissions picked up by the `student.*` wildcard.
      '!student.self.read',
    ],
  },
  {
    code: 'front_office',
    name: 'Front Office / Receptionist',
    description: 'Gate-facing admin: visitors, enquiries, certificates, calls.',
    cluster: 'admin',
    appTarget: 'admin',
    defaultScope: 'branch',
    homeScreen: 'front_office',
    nav: ['front_office', 'visitors', 'enquiries', 'certificates', 'gate_passes', 'student_lookup'],
    permissions: [
      'student.record.read', 'staff.record.read',
      'gate.visitor.*', 'gate.pass.manage',
      'admission.enquiry.*',
      'certificate.read', 'certificate.issue',
      'comms.announcement.read', 'comms.thread.read', 'comms.message.send',
      'attendance.student.read', 'leave.request.read',
      'fee.status.read', 'helpdesk.ticket.read', 'helpdesk.ticket.manage',
      'event.read', 'task.read',
      'guardian.account.issue.bulk',
    ],
  },
  {
    code: 'mis_operator',
    name: 'MIS / Data Operator',
    description: 'Statutory data entry: UDISE+, APAAR, bulk imports.',
    cluster: 'admin',
    appTarget: 'admin',
    defaultScope: 'branch',
    homeScreen: 'compliance_centre',
    nav: ['compliance_centre', 'apaar_worklist', 'udise_export', 'imports'],
    permissions: [
      'compliance.*', 'student.record.read', 'student.record.manage',
      'student.apaar.manage', 'student.import.run', 'student.document.read',
      'staff.record.read', 'academic.master.read', 'academic.session.read',
      'print.bulk.run', 'idcard.manage',
    ],
  },

  // ==========================================================================
  // ADMISSIONS
  // ==========================================================================
  {
    code: 'admissions_counsellor',
    name: 'Admissions Counsellor',
    description: 'Owns the enquiry-to-enrolment funnel.',
    cluster: 'admissions',
    appTarget: 'admin',
    defaultScope: 'branch',
    homeScreen: 'admissions_funnel',
    nav: ['admissions_funnel', 'enquiries', 'applications', 'admission_reports'],
    permissions: [
      'admission.*', 'student.record.read', 'student.record.manage',
      'student.document.read', 'student.document.manage', 'student.guardian.manage',
      'guardian.account.issue',
      'academic.master.read', 'academic.session.read',
      'fee.structure.read', 'fee.invoice.read', 'fee.payment.collect',
      'comms.announcement.read', 'comms.message.send', 'comms.thread.read',
      'analytics.report.read',
    ],
  },

  // ==========================================================================
  // FINANCE
  // ==========================================================================
  {
    code: 'accounts_head',
    name: 'Accounts Head / Finance Manager',
    description: 'Owns fees, reconciliation, ledgers and financial reporting.',
    cluster: 'finance',
    appTarget: 'admin',
    defaultScope: 'branch',
    homeScreen: 'finance_dashboard',
    nav: [
      'finance_dashboard', 'approvals', 'collection', 'reconciliation',
      'defaulters', 'fee_structures', 'ledgers', 'reports', 'students.subscriptions',
    ],
    permissions: [
      'fee.*', 'accounting.*', 'finance.report.read',
      'expense.*', 'store.*', 'canteen.wallet.manage',
      'payroll.read', 'payroll.manage',
      'student.record.read', 'staff.record.read', 'staff.salary.read',
      'academic.session.read', 'academic.master.read',
      'subscription.student.read', 'subscription.manual.activate',
      'comms.announcement.create', 'comms.announcement.read', 'comms.thread.read',
      'analytics.report.read', 'approval.inbox.read', 'print.bulk.run',
      'audit.log.read',
    ],
  },
  {
    code: 'cashier',
    name: 'Fee Counter Clerk / Cashier',
    description: 'Collects payments, prints receipts, closes the daybook. Nothing else.',
    cluster: 'finance',
    appTarget: 'admin',
    defaultScope: 'branch',
    homeScreen: 'fee_counter',
    nav: ['fee_counter', 'collect_fee', 'receipts', 'daybook'],
    permissions: [
      'fee.invoice.read', 'fee.status.read', 'fee.payment.collect',
      'fee.defaulter.read', 'fee.structure.read', 'fee.concession.read',
      'student.record.read',
      '!fee.payment.refund', '!fee.structure.manage', '!fee.concession.manage',
    ],
  },

  // ==========================================================================
  // HR
  // ==========================================================================
  {
    code: 'hr_manager',
    name: 'HR Manager',
    description: 'Staff lifecycle: records, leave, attendance, recruitment, appraisal.',
    cluster: 'hr',
    appTarget: 'admin',
    defaultScope: 'branch',
    homeScreen: 'hr_dashboard',
    nav: ['hr_dashboard', 'approvals', 'staff', 'staff_attendance', 'leave', 'recruitment', 'appraisal'],
    permissions: [
      'staff.*', 'attendance.staff.*', 'leave.*',
      'payroll.read', 'expense.read',
      'rbac.assignment.read', 'rbac.assignment.manage', 'rbac.role.read',
      'comms.announcement.create', 'comms.announcement.read', 'comms.thread.read',
      'task.*', 'meeting.*', 'approval.inbox.read', 'analytics.report.read',
      'document.esign.apply',
    ],
  },
  {
    code: 'payroll_officer',
    name: 'Payroll Officer',
    description: 'Runs payroll and statutory filings.',
    cluster: 'hr',
    appTarget: 'admin',
    defaultScope: 'branch',
    homeScreen: 'payroll',
    nav: ['payroll', 'payslips', 'statutory'],
    permissions: [
      'payroll.read', 'payroll.manage',
      'staff.record.read', 'staff.salary.read', 'attendance.staff.read', 'leave.request.read',
      'accounting.ledger.read', 'print.bulk.run',
      '!payroll.approve',
    ],
  },

  // ==========================================================================
  // TEACHING — the two roles that must stay separate
  // ==========================================================================
  {
    code: 'class_teacher',
    name: 'Class Teacher',
    description:
      'Owns one section: attendance, diary, report cards, parent relationships. ' +
      'Scoped to their assigned sections via staff_section_assignments.',
    cluster: 'teaching',
    appTarget: 'admin',
    defaultScope: 'section',
    homeScreen: 'teacher_home',
    nav: [
      'teacher_home', 'take_attendance', 'my_class', 'homework', 'diary',
      'marks_entry', 'report_cards', 'messages', 'timetable', 'leave',
    ],
    permissions: [
      'student.record.read', 'student.document.read', 'student.guardian.manage',
      'attendance.student.read', 'attendance.student.mark',
      'attendance.staff.read', 'leave.request.create', 'leave.request.read',
      'homework.*', 'diary.*', 'lessonplan.read', 'lessonplan.manage',
      'exam.read', 'exam.marks.read', 'exam.marks.enter',
      'reportcard.read', 'reportcard.manage', 'hpc.read', 'hpc.assess',
      'timetable.read', 'substitution.read',
      'comms.announcement.read', 'comms.announcement.create',
      'comms.thread.read', 'comms.message.send',
      'notification.inbox.read',
      'incident.read', 'incident.manage',
      'health.record.read',
      'book.read', 'library.item.read',
      'gallery.read', 'gallery.manage', 'survey.read', 'event.read',
      // No approval.inbox.read: a class teacher decides nothing in that queue,
      // so it only widened the role's surface area.
      'task.read', 'meeting.read',
      'counselling.case.indicator',
      'atrisk.read',
      // Your decision #2.
      'fee.status.read',
      'pickup.authorisation.read',
      'transport.boarding.read',
      '!fee.invoice.read', '!fee.payment.collect',
    ],
  },
  {
    code: 'subject_teacher',
    name: 'Subject Teacher',
    description:
      'Teaches one or more subjects across many sections. Owns marks for those ' +
      'subject+section pairs only. Scoped via staff_subject_assignments.',
    cluster: 'teaching',
    appTarget: 'admin',
    defaultScope: 'subject',
    homeScreen: 'teacher_home',
    nav: ['teacher_home', 'take_attendance', 'marks_entry', 'homework', 'timetable', 'messages', 'leave'],
    permissions: [
      'student.record.read',
      'attendance.student.read', 'attendance.student.mark',
      'attendance.staff.read', 'leave.request.create', 'leave.request.read',
      'homework.*', 'diary.read', 'lessonplan.read', 'lessonplan.manage',
      'exam.read', 'exam.marks.read', 'exam.marks.enter',
      'hpc.read', 'hpc.assess',
      'timetable.read', 'substitution.read',
      'comms.announcement.read', 'comms.thread.read', 'comms.message.send',
      'book.read', 'book.manage', 'library.item.read',
      'survey.read', 'event.read', 'task.read',
      // Your decision #2 — status only, never payment detail.
      'fee.status.read',
      '!reportcard.manage', '!student.document.read', '!incident.manage',
    ],
  },
  {
    code: 'cocurricular_staff',
    name: 'Co-curricular Staff',
    description: 'Sports, music, art. Assesses co-scholastic domains, runs events.',
    cluster: 'teaching',
    appTarget: 'admin',
    defaultScope: 'branch',
    homeScreen: 'teacher_home',
    nav: ['teacher_home', 'take_attendance', 'activities', 'hpc', 'events', 'messages'],
    permissions: [
      'student.record.read', 'attendance.student.read', 'attendance.student.mark',
      'attendance.staff.read', 'leave.request.create', 'leave.request.read',
      'hpc.read', 'hpc.assess', 'exam.marks.read', 'exam.marks.enter',
      'timetable.read', 'comms.announcement.read', 'comms.thread.read', 'comms.message.send',
      'gallery.read', 'gallery.manage', 'event.read', 'event.manage',
      'task.read', 'book.read',
    ],
  },
  {
    code: 'special_educator',
    name: 'Special Educator / Counsellor',
    description:
      'The ONLY role with counselling note access. Restricted tier: also needs ' +
      'a record_access_grant per case, and every read is audited.',
    cluster: 'teaching',
    appTarget: 'admin',
    defaultScope: 'branch',
    homeScreen: 'counsellor_home',
    nav: ['counsellor_home', 'caseload', 'session_notes', 'referrals', 'safe_reports'],
    permissions: [
      'student.record.read', 'student.document.read',
      'attendance.student.read',
      'counselling.note.read', 'counselling.note.manage', 'counselling.case.indicator',
      'safereport.read',
      'health.record.read', 'incident.read', 'incident.manage',
      'hpc.read', 'hpc.assess',
      'comms.thread.read', 'comms.message.send',
      'atrisk.read', 'task.read',
      'leave.request.create', 'attendance.staff.read',
    ],
  },
  {
    code: 'substitute_teacher',
    name: 'Substitute / Visiting Teacher',
    description: 'Temporary cover. Attendance and homework for assigned periods only.',
    cluster: 'teaching',
    appTarget: 'admin',
    defaultScope: 'section',
    homeScreen: 'teacher_home',
    nav: ['teacher_home', 'take_attendance', 'timetable'],
    permissions: [
      'student.record.read', 'attendance.student.read', 'attendance.student.mark',
      'timetable.read', 'substitution.read', 'homework.read',
      'comms.announcement.read', 'attendance.staff.read',
    ],
  },

  // ==========================================================================
  // SUPPORT
  // ==========================================================================
  {
    code: 'librarian',
    name: 'Librarian',
    description: 'Physical catalogue, issue/return, and the digital book shelf.',
    cluster: 'support',
    appTarget: 'admin',
    defaultScope: 'branch',
    homeScreen: 'library_desk',
    nav: ['library_desk', 'catalogue', 'issue_return', 'overdue', 'digital_books'],
    permissions: [
      'library.*', 'book.*', 'student.record.read', 'staff.record.read',
      'comms.announcement.read', 'attendance.staff.read', 'leave.request.create',
      'idcard.manage', 'task.read',
    ],
  },
  {
    code: 'lab_incharge',
    name: 'Lab In-charge',
    description: 'Lab inventory, practical exams, safety.',
    cluster: 'support',
    appTarget: 'admin',
    defaultScope: 'branch',
    homeScreen: 'lab_home',
    nav: ['lab_home', 'inventory', 'practical_exams'],
    permissions: [
      'student.record.read', 'exam.read', 'exam.marks.read', 'exam.marks.enter',
      'timetable.read', 'incident.read', 'incident.manage',
      'comms.announcement.read', 'attendance.staff.read', 'leave.request.create',
      'task.read',
    ],
  },
  {
    code: 'school_nurse',
    name: 'School Nurse / Infirmary',
    description: 'Health records, clinic visits, medication consent.',
    cluster: 'support',
    appTarget: 'admin',
    defaultScope: 'branch',
    homeScreen: 'infirmary',
    nav: ['infirmary', 'clinic_visits', 'health_records', 'allergies'],
    permissions: [
      'student.record.read', 'health.record.read', 'health.record.manage',
      'incident.read', 'incident.manage',
      'comms.thread.read', 'comms.message.send', 'comms.announcement.read',
      'attendance.student.read', 'attendance.staff.read', 'leave.request.create',
      'staff.record.read', 'task.read',
    ],
  },
  {
    code: 'store_keeper',
    name: 'Store / Inventory Keeper',
    description: 'Books, uniforms, lab and general stock.',
    cluster: 'support',
    appTarget: 'admin',
    defaultScope: 'branch',
    homeScreen: 'store_home',
    nav: ['store_home', 'inventory', 'sales', 'indents'],
    permissions: [
      'store.*', 'expense.read', 'expense.manage',
      'student.record.read', 'staff.record.read',
      'comms.announcement.read', 'attendance.staff.read', 'leave.request.create',
      'task.read',
    ],
  },

  // ==========================================================================
  // SAFETY
  // ==========================================================================
  {
    code: 'security_head',
    name: 'Security Head',
    description: 'Owns gate, visitors, dismissal safety and incidents.',
    cluster: 'safety',
    appTarget: 'admin',
    defaultScope: 'branch',
    homeScreen: 'security_dashboard',
    // Holds attendance.staff.mark because the gate is where staff sign in.
    nav: [
      'security_dashboard', 'visitors', 'pickup_queue', 'gate_passes',
      'staff_attendance', 'incidents', 'emergency',
    ],
    permissions: [
      'gate.*', 'pickup.*', 'incident.read', 'incident.manage',
      'comms.emergency.broadcast', 'comms.announcement.read',
      'student.record.read', 'staff.record.read',
      'attendance.student.read', 'attendance.staff.read', 'attendance.staff.mark',
      'transport.route.read', 'transport.tracking.read', 'transport.boarding.read',
      'leave.request.create', 'task.read',
    ],
  },
  {
    code: 'security_guard',
    name: 'Security Guard',
    description:
      'Four screens: scan a visitor, verify a pickup, log a gate pass, raise SOS. ' +
      'The narrowest staff role in the system, deliberately.',
    cluster: 'safety',
    appTarget: 'admin',
    defaultScope: 'branch',
    homeScreen: 'gate_scanner',
    nav: ['gate_scanner', 'verify_pickup', 'gate_pass', 'sos'],
    permissions: [
      'gate.visitor.read', 'gate.visitor.manage', 'gate.pass.manage',
      'pickup.authorisation.read', 'pickup.handover.record',
      'student.record.read',
      'transport.sos.raise',
      '!pickup.handover.override',
      '!student.document.read',
    ],
  },

  // ==========================================================================
  // TRANSPORT
  // ==========================================================================
  {
    code: 'transport_incharge',
    name: 'Transport In-charge',
    description: 'Routes, stops, vehicles, live tracking, driver compliance.',
    cluster: 'transport',
    appTarget: 'admin',
    defaultScope: 'branch',
    homeScreen: 'transport_dashboard',
    nav: ['transport_dashboard', 'live_map', 'routes', 'vehicles', 'boarding_exceptions', 'compliance'],
    permissions: [
      'transport.*', 'student.record.read', 'staff.record.read',
      'fee.status.read', 'fee.structure.read',
      'comms.announcement.create', 'comms.announcement.read', 'comms.thread.read',
      'incident.read', 'incident.manage',
      'expense.read', 'expense.manage',
      'attendance.staff.read', 'leave.request.create', 'task.read',
    ],
  },
  {
    code: 'driver',
    name: 'Driver / Bus Attendant',
    description: 'Three screens: start route, scan boarding, SOS. Nothing else.',
    cluster: 'transport',
    appTarget: 'admin',
    defaultScope: 'self',
    homeScreen: 'driver_home',
    nav: ['driver_home', 'scan_boarding', 'sos'],
    permissions: [
      'transport.trip.operate', 'transport.route.read', 'transport.boarding.read',
      'transport.sos.raise',
      'student.record.read',
      'attendance.staff.read', 'leave.request.create',
      '!student.document.read', '!comms.message.send',
    ],
  },

  // ==========================================================================
  // FAMILY
  // ==========================================================================
  {
    code: 'parent',
    name: 'Parent / Primary Guardian',
    description:
      'Account owner and DPDP consent holder. Has authority over their own ' +
      "child's data that no staff role has.",
    cluster: 'family',
    appTarget: 'family',
    defaultScope: 'self',
    homeScreen: 'family_home',
    nav: [
      'family_home', 'attendance', 'homework', 'notices', 'fees', 'results',
      'bus', 'books', 'gallery', 'pickup', 'messages', 'privacy',
    ],
    permissions: [
      'family.*', 'student.self.read',
      'student.record.read', 'student.document.read',
      'attendance.student.read', 'leave.request.create', 'leave.request.read',
      'homework.read', 'diary.read',
      'exam.read', 'exam.marks.read', 'reportcard.read', 'hpc.read',
      'fee.invoice.read', 'fee.status.read',
      'comms.announcement.read', 'comms.thread.read', 'comms.message.send',
      'notification.inbox.read',
      'survey.respond', 'survey.read', 'gallery.read', 'event.read',
      'transport.tracking.read', 'transport.boarding.read', 'transport.route.read',
      'pickup.authorisation.read', 'pickup.authorisation.manage',
      'book.read', 'library.item.read',
      'health.record.read', 'certificate.read',
      'helpdesk.ticket.read', 'helpdesk.ticket.manage',
      'privacy.consent.read', 'privacy.consent.manage',
      'counselling.case.indicator',
    ],
  },
  {
    code: 'secondary_guardian',
    name: 'Secondary Guardian',
    description:
      'Second parent. Same view as primary; capability toggles live on ' +
      'student_guardians (payment ON by default, per decision #4).',
    cluster: 'family',
    appTarget: 'family',
    defaultScope: 'self',
    homeScreen: 'family_home',
    nav: ['family_home', 'attendance', 'homework', 'notices', 'fees', 'results', 'bus', 'books', 'gallery', 'messages'],
    permissions: [
      'family.child.read', 'family.fee.pay', 'family.leave.request', 'family.ptm.book',
      'student.record.read',
      'attendance.student.read', 'leave.request.create', 'leave.request.read',
      'homework.read', 'diary.read',
      'exam.read', 'exam.marks.read', 'reportcard.read', 'hpc.read',
      'fee.invoice.read', 'fee.status.read',
      'comms.announcement.read', 'comms.thread.read', 'comms.message.send',
      'notification.inbox.read',
      'survey.respond', 'gallery.read', 'event.read',
      'transport.tracking.read', 'transport.boarding.read',
      'pickup.authorisation.read',
      'book.read', 'certificate.read',
      // Consent is the PRIMARY guardian's alone.
      '!privacy.consent.manage', '!family.consent.manage', '!family.data.request',
    ],
  },
  {
    code: 'student',
    name: 'Student',
    description:
      'Under-18 accounts run under parental consent. No behavioural tracking, ' +
      'no ads — DPDP prohibits both for children.',
    cluster: 'family',
    appTarget: 'family',
    defaultScope: 'self',
    homeScreen: 'student_home',
    nav: ['student_home', 'timetable', 'homework', 'results', 'books', 'notices', 'library'],
    permissions: [
      'student.self.read',
      'attendance.student.read',
      'homework.read', 'diary.read',
      'timetable.read',
      'exam.read', 'exam.marks.read', 'reportcard.read', 'hpc.read', 'hpc.assess',
      'book.read', 'library.item.read',
      'comms.announcement.read',
      'gallery.read', 'event.read', 'survey.respond',
      // Enabled only when the school turns on safe_reporting (decision #3).
      'safereport.create',
      '!comms.message.send', '!fee.invoice.read', '!fee.status.read',
    ],
  },

  // ==========================================================================
  // PLATFORM (internal)
  // ==========================================================================
  {
    code: 'platform_super_admin',
    name: 'Platform Super Admin',
    description: 'Our team. Cross-tenant access via the audited platform_admin flag.',
    cluster: 'platform',
    appTarget: 'control',
    defaultScope: 'tenant',
    homeScreen: 'control_home',
    nav: ['control_home', 'tenants', 'billing', 'activation', 'support', 'flags'],
    permissions: ['*'],
  },
  {
    code: 'platform_support',
    name: 'Support Agent',
    description: 'Time-boxed, audited impersonation. Read-heavy.',
    cluster: 'platform',
    appTarget: 'control',
    defaultScope: 'tenant',
    homeScreen: 'support_queue',
    nav: ['support_queue', 'tenants', 'impersonate', 'helpdesk'],
    permissions: [
      'tenant.settings.read', 'tenant.billing.read',
      'dashboard.*', 'analytics.*', 'audit.*',
      'helpdesk.*', 'student.record.read', 'staff.record.read',
      '!counselling.note.read', '!counselling.note.manage',
      '!safereport.read', '!health.record.read', '!payroll.read',
      '!student.document.read',
    ],
  },
];

// ===========================================================================
// Scope resolution
// ===========================================================================

/**
 * Scope breadth ladder, narrowest first. Position matters — the resolver
 * walks this array.
 */
const SCOPE_LADDER: ScopeType[] = ['self', 'subject', 'section', 'branch', 'tenant'];

/**
 * A role has ONE `defaultScope`, but not every permission accepts it.
 * A Subject Teacher defaults to `subject`, yet `student.record.read` is only
 * legal at tenant/branch/section/self. Granting it at the role default would
 * be invalid; granting it at `branch` would let a subject teacher read the
 * whole school.
 *
 * Resolution order:
 *   1. Role default is legal        -> use it. (the common case)
 *   2. Widen by EXACTLY ONE rung    -> `subject` becomes `section` for a
 *      subject teacher. This is the intended semantic and must be tried
 *      BEFORE narrowing.
 *   3. Narrow to the widest legal scope below the default -> always safe.
 *      (Special Educator defaults to `branch`; counselling.note.manage is
 *       `self`-only, so they get `self`.)
 *   4. Otherwise throw. More than one rung of widening is a MISTAKE IN THE
 *      CATALOGUE, not something to paper over.
 *
 * ORDER OF 2 AND 3 IS NOT COSMETIC. Narrowing first looks safer and is
 * catastrophic: a Subject Teacher (default `subject`) holding
 * `student.record.read` (legal at tenant/branch/section/self) would narrow to
 * `self` and see ZERO students — the role silently stops working. Widening one
 * rung to `section` is what the role actually means.
 *
 * Rule 4 is the guard rail. It is the difference between "a parent can see
 * their own child's consent record" and "a parent can see the whole branch's".
 */
export function resolveScope(
  roleCode: string,
  permissionCode: string,
  roleDefault: ScopeType,
  allowed: readonly ScopeType[],
): ScopeType {
  if (!allowed || allowed.length === 0) return roleDefault;
  if (allowed.includes(roleDefault)) return roleDefault;

  const defaultIdx = SCOPE_LADDER.indexOf(roleDefault);
  const legalIdx = allowed
    .map((s) => SCOPE_LADDER.indexOf(s))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);

  // 2. Widen by exactly one rung. MUST be tried before narrowing.
  const wider = legalIdx.filter((i) => i > defaultIdx);
  if (wider.length && wider[0] - defaultIdx === 1) return SCOPE_LADDER[wider[0]];

  // 3. Narrow — always safe, never over-grants.
  const narrower = legalIdx.filter((i) => i < defaultIdx);
  if (narrower.length) return SCOPE_LADDER[narrower[narrower.length - 1]];

  // 4. Refuse to over-grant.
  throw new Error(
    `Scope resolution failed: role '${roleCode}' (default '${roleDefault}') holds ` +
      `'${permissionCode}', which only allows [${allowed.join(', ')}]. Widening to ` +
      `'${SCOPE_LADDER[wider[0]] ?? 'n/a'}' would be ${wider[0] - defaultIdx} steps and ` +
      `would over-grant. Fix the permission's allowed scopes, or remove it from this role.`,
  );
}

/** Expands wildcards and applies `!` exclusions against the catalogue. */
export function resolvePermissionCodes(
  patterns: string[],
  allCodes: string[],
): string[] {
  const granted = new Set<string>();
  const denied = new Set<string>();

  for (const raw of patterns) {
    const isDeny = raw.startsWith('!');
    const pattern = isDeny ? raw.slice(1) : raw;
    const target = isDeny ? denied : granted;

    if (pattern === '*') {
      allCodes.forEach((c) => target.add(c));
    } else if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      allCodes.filter((c) => c.startsWith(prefix)).forEach((c) => target.add(c));
    } else {
      if (!allCodes.includes(pattern)) {
        throw new Error(`Unknown permission in role seed: ${pattern}`);
      }
      target.add(pattern);
    }
  }

  // Exclusions always win, regardless of order in the source array.
  denied.forEach((c) => granted.delete(c));
  return [...granted].sort();
}
