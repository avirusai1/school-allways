/**
 * Global catalogues: subscription plans and DPDP consent purposes.
 * Both seed with tenant_id NULL / no tenant column — shared by every school.
 */

// ---------------------------------------------------------------------------
// Plans (module A11)
//
// The platform is free for schools. One public plan unlocks every module;
// parent access is gated per-student via student_subscriptions, not here.
// Pilot remains a private, manually assigned row for the 10 launch schools.
// ---------------------------------------------------------------------------

export type PlanSeed = {
  code: string;
  name: string;
  tier: 'free' | 'standard' | 'pro' | 'pilot';
  pricePerStudentYear: number;
  maxStudents: number | null;
  maxBranches: number | null;
  includedModules: string[];
  isPublic: boolean;
};

/** Every module. Gating moved to the per-student subscription layer. */
const PRO_MODULES = [
  'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A12',
  'B1', 'B2', 'B3', 'B8',
  'F1', 'F3', 'F4', 'F5', 'F14',
  'A13', 'A15', 'A16', 'A17', 'A18',
  'B4', 'B5', 'B6', 'B7', 'B9', 'B10', 'B11', 'B13', 'B14', 'B15', 'B16',
  'B18', 'B19', 'B20', 'B21', 'B22', 'B25', 'B27', 'B28', 'B29', 'B30', 'B31',
  'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11',
  'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8',
  'E1', 'E2', 'E3', 'E4', 'E5', 'E6',
  'F2', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'F13', 'F15',
  'G6',
];

export const PLANS: PlanSeed[] = [
  {
    code: 'free',
    name: 'Free',
    tier: 'free',
    pricePerStudentYear: 0,
    maxStudents: null,
    maxBranches: null,
    includedModules: PRO_MODULES,
    isPublic: true,
  },
  {
    /**
     * The 10 free pilot schools. Everything unlocked, ₹0, not publicly listed.
     * Assign manually from the control console.
     */
    code: 'pilot',
    name: 'Pilot Programme',
    tier: 'pilot',
    pricePerStudentYear: 0,
    maxStudents: null,
    maxBranches: 5,
    includedModules: PRO_MODULES,
    isPublic: false,
  },
];

// ---------------------------------------------------------------------------
// DPDP consent purposes (module A12)
//
// Under the DPDP Act every student under 18 is a "child", and processing their
// data needs VERIFIABLE parental consent. Purposes marked `isEssential` are
// those without which the school cannot function — they are still disclosed in
// the notice, but a school cannot operate if they are refused, so refusal means
// the child cannot be enrolled on the platform rather than a partial service.
//
// Everything else is genuinely optional and must degrade gracefully when
// refused. If refusing "gallery photos" breaks the app, that is a bug.
// ---------------------------------------------------------------------------

export type ConsentPurposeSeed = {
  code: string;
  name: string;
  description: string;
  translations: Record<string, string>;
  isEssential: boolean;
  category: string;
  retentionDays: number | null;
};

export const CONSENT_PURPOSES: ConsentPurposeSeed[] = [
  {
    code: 'core_academic_record',
    name: 'Academic records',
    description:
      'Storing your child\'s enrolment, attendance, marks and report cards so the ' +
      'school can teach and assess them.',
    translations: {
      hi: 'आपके बच्चे का नामांकन, उपस्थिति, अंक और रिपोर्ट कार्ड संग्रहीत करना, ताकि विद्यालय पढ़ा और मूल्यांकन कर सके।',
    },
    isEssential: true,
    category: 'operational',
    // Boards commonly require academic records to be retained for years after
    // a student leaves. 7 years is a conservative default; confirm per state.
    retentionDays: 2555,
  },
  {
    code: 'fee_and_billing',
    name: 'Fees and billing',
    description: 'Generating invoices, accepting payments and issuing receipts.',
    translations: { hi: 'शुल्क बिल बनाना, भुगतान लेना और रसीद जारी करना।' },
    isEssential: true,
    category: 'operational',
    retentionDays: 2920, // 8 years — statutory books-of-account expectation
  },
  {
    code: 'parent_communication',
    name: 'Communication with you',
    description:
      'Sending notices, homework, absence alerts and messages from teachers via ' +
      'the app, SMS or WhatsApp.',
    translations: { hi: 'ऐप, एसएमएस या व्हाट्सएप द्वारा सूचनाएँ और संदेश भेजना।' },
    isEssential: true,
    category: 'operational',
    retentionDays: 1095,
  },
  {
    code: 'statutory_reporting',
    name: 'Government reporting (UDISE+, APAAR, board)',
    description:
      'Sharing required details with UDISE+, the APAAR/ABC system and your ' +
      'child\'s examination board, as the law requires.',
    translations: { hi: 'कानून के अनुसार UDISE+, APAAR और बोर्ड को आवश्यक जानकारी देना।' },
    isEssential: true,
    category: 'statutory',
    retentionDays: null, // legal hold
  },
  {
    code: 'health_records',
    name: 'Health and medical information',
    description:
      'Recording allergies, conditions and clinic visits so the school can keep ' +
      'your child safe, and administer medicine if you authorise it.',
    translations: { hi: 'एलर्जी, बीमारी और चिकित्सा जानकारी दर्ज करना ताकि विद्यालय आपके बच्चे की सुरक्षा कर सके।' },
    isEssential: false,
    category: 'health',
    retentionDays: 1825,
  },
  {
    code: 'transport_tracking',
    name: 'School bus location',
    description:
      'Recording when your child boards and leaves the bus, and showing you the ' +
      'bus location while they travel.',
    translations: { hi: 'बस में चढ़ने-उतरने का समय दर्ज करना और यात्रा के दौरान बस की लोकेशन दिखाना।' },
    isEssential: false,
    category: 'safety',
    // Location data has no reason to persist. 90 days covers dispute windows.
    retentionDays: 90,
  },
  {
    code: 'photos_and_media',
    name: 'Photographs and video',
    description:
      'Using photos or video of your child in the school gallery inside this app. ' +
      'Refusing this does not affect anything else.',
    translations: { hi: 'ऐप की गैलरी में आपके बच्चे की तस्वीर या वीडियो उपयोग करना। मना करने से कुछ और प्रभावित नहीं होगा।' },
    isEssential: false,
    category: 'media',
    retentionDays: 1095,
  },
  {
    code: 'public_media',
    name: 'Photographs for school publicity',
    description:
      'Using photos of your child on the school website, brochures or social ' +
      'media. This is separate from the in-app gallery and you may refuse it.',
    translations: { hi: 'विद्यालय की वेबसाइट, ब्रोशर या सोशल मीडिया पर आपके बच्चे की तस्वीर उपयोग करना।' },
    isEssential: false,
    category: 'media',
    retentionDays: 1095,
  },
  {
    code: 'biometric_attendance',
    name: 'Biometric or RFID attendance',
    description:
      'Using a fingerprint, face scan or RFID card to record attendance or bus ' +
      'boarding.',
    translations: { hi: 'उपस्थिति दर्ज करने के लिए बायोमेट्रिक या RFID कार्ड का उपयोग।' },
    isEssential: false,
    category: 'biometric',
    retentionDays: 365,
  },
  {
    code: 'counselling_support',
    name: 'Counselling and learning support',
    description:
      'Keeping notes from counselling or special-education sessions. These are ' +
      'restricted: only the counsellor and you can read them.',
    translations: { hi: 'काउंसलिंग या विशेष शिक्षा सत्र के नोट्स रखना। ये केवल काउंसलर और आप देख सकते हैं।' },
    isEssential: false,
    category: 'health',
    retentionDays: 1825,
  },
  {
    code: 'aadhaar_for_apaar',
    name: 'Aadhaar use for APAAR ID',
    description:
      'Using your child\'s Aadhaar details to generate their APAAR ID on UDISE+. ' +
      'We do not store the full Aadhaar number — only the last four digits.',
    translations: { hi: 'APAAR आईडी बनाने के लिए आधार का उपयोग। हम पूरा आधार नंबर संग्रहीत नहीं करते।' },
    isEssential: false,
    category: 'statutory',
    retentionDays: null,
  },
];
