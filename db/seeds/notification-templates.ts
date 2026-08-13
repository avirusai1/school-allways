/**
 * Global notification templates (module A6).
 *
 * Seeded with tenant_id NULL. A school may override any of these with its own
 * wording by inserting a row with its tenant_id; the dispatcher prefers the
 * tenant's copy and falls back to these.
 *
 * DLT
 * ---
 * `dltTemplateId` is deliberately NULL here. A TRAI DLT id is issued to a
 * specific registered entity for a specific body of text — it is the school's
 * (or our) registration, not a constant we can ship. Inventing one would mean
 * handing a carrier an id it will reject, which is a worse failure than an
 * honest absence. The dispatcher only enforces DLT for providers that actually
 * talk to a carrier, so these send fine on the logging provider and will fail
 * loudly, per template, the moment a real gateway is configured without the
 * registration done.
 *
 * SMS bodies stay inside 160 GSM-7 characters after substitution wherever the
 * variables allow it — an SMS that spills to a second segment doubles its cost
 * across every parent in the school.
 */

export type NotificationTemplateSeed = {
  code: string;
  channel: 'push' | 'in_app' | 'sms' | 'whatsapp' | 'email';
  subject: string | null;
  body: string;
  variables: string[];
};

export const NOTIFICATION_TEMPLATES: NotificationTemplateSeed[] = [
  // --- Auth: OTP (email-first; SMS stub until a paid gateway exists) --------
  {
    code: 'OTP_LOGIN',
    channel: 'email',
    subject: 'Your School All Ways verification code',
    body:
      'Your verification code is {{code}}. It expires in a few minutes.\n\n' +
      'If you did not request this, you can ignore this email.',
    variables: ['code', 'purpose'],
  },
  {
    code: 'OTP_LOGIN',
    channel: 'sms',
    subject: null,
    body: 'School All Ways code: {{code}}',
    variables: ['code'],
  },

  // --- Onboarding: staff invitation (A5) -----------------------------------
  {
    code: 'STAFF_INVITE',
    channel: 'email',
    subject: 'You are invited to School All Ways — {{schoolName}}',
    body:
      'Hello,\n\n' +
      '{{schoolName}} has invited you to School All Ways.\n\n' +
      'Open this link to set up your account:\n{{link}}\n\n' +
      'If you were not expecting this, you can ignore this email.',
    variables: ['schoolName', 'link', 'name'],
  },
  {
    code: 'STAFF_INVITE',
    channel: 'sms',
    subject: null,
    body: '{{schoolName}} has invited you to School All Ways. Tap to set up your account: {{link}}',
    variables: ['schoolName', 'link'],
  },
  {
    code: 'STAFF_INVITE',
    channel: 'in_app',
    subject: 'Set up your account',
    body: '{{schoolName}} has invited you to School All Ways. Tap to set up your account.',
    variables: ['schoolName'],
  },

  // --- Onboarding: parent invitation (A5) ----------------------------------
  //
  // The self-fill ask is in the body on purpose. A parent who is told up front
  // that they are completing their child's details is the entire reason the
  // school does not have to type them.
  {
    code: 'PARENT_PROFILE_INVITE',
    channel: 'email',
    subject: 'Complete {{studentName}}’s profile at {{schoolName}}',
    body:
      '{{schoolName}} has invited you to School All Ways for {{studentName}}.\n\n' +
      'Open this link to set up your account and add their address and photo:\n{{link}}\n\n' +
      'If you were not expecting this, you can ignore this email.',
    variables: ['schoolName', 'studentName', 'link'],
  },
  {
    code: 'PARENT_PROFILE_INVITE',
    channel: 'sms',
    subject: null,
    body:
      '{{schoolName}} has invited you to School All Ways for {{studentName}}. ' +
      'Set up your account and complete their details: {{link}}',
    variables: ['schoolName', 'studentName', 'link'],
  },
  {
    code: 'PARENT_PROFILE_INVITE',
    channel: 'whatsapp',
    subject: null,
    body:
      '{{schoolName}} has invited you to School All Ways for {{studentName}}. ' +
      // No "and documents" until document upload exists — a pilot school
      // reading a promise the product cannot keep is worse than a shorter,
      // accurate sentence.
      'Set up your account and add their address and photo: {{link}}',
    variables: ['schoolName', 'studentName', 'link'],
  },
  {
    code: 'PARENT_PROFILE_INVITE',
    channel: 'in_app',
    subject: 'Complete your child\u2019s profile',
    body: 'Please add {{studentName}}\u2019s address and photo.',
    variables: ['studentName'],
  },

  // --- Attendance: absence alert (B3) --------------------------------------
  //
  // The promise made on the last screen of onboarding. High priority, so an
  // unread push escalates to SMS via the ladder.
  {
    code: 'STUDENT_ABSENT',
    channel: 'push',
    subject: 'Absent today',
    body: '{{studentName}} was marked absent today ({{date}}).',
    variables: ['studentName', 'date'],
  },
  {
    code: 'STUDENT_ABSENT',
    channel: 'in_app',
    subject: 'Absent today',
    body:
      '{{studentName}} was marked absent on {{date}}. Contact the school office if ' +
      'this is not right.',
    variables: ['studentName', 'date'],
  },
  {
    code: 'STUDENT_ABSENT',
    channel: 'sms',
    subject: null,
    body: '{{schoolName}}: {{studentName}} was marked absent on {{date}}.',
    variables: ['schoolName', 'studentName', 'date'],
  },

  // --- Circulars and notices (A6) ------------------------------------------
  {
    code: 'ANNOUNCEMENT',
    channel: 'push',
    subject: '{{title}}',
    body: '{{title}}',
    variables: ['title'],
  },
  {
    code: 'ANNOUNCEMENT',
    channel: 'in_app',
    subject: '{{title}}',
    body: '{{body}}',
    variables: ['title', 'body'],
  },
  {
    code: 'ANNOUNCEMENT',
    channel: 'sms',
    subject: null,
    body: '{{schoolName}}: {{title}}. Open the app for details.',
    variables: ['schoolName', 'title'],
  },

  // --- Onboarding nudge (A5) -----------------------------------------------
  //
  // Sent to the admin who started setup and stopped. in_app only: nagging a
  // principal by SMS about their own unfinished setup buys irritation, not
  // completion.
  {
    code: 'ONBOARDING_NUDGE',
    channel: 'in_app',
    subject: 'Finish setting up {{schoolName}}',
    body: 'You are {{percent}}% through setup. {{nextStep}} is next.',
    variables: ['schoolName', 'percent', 'nextStep'],
  },
];
