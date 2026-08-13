/** CBSE class ladder: Nursery (-3) through XII (12). */
export const CBSE_CLASSES = [
  { name: 'Nursery', level: -3, stage: 'pre_primary' },
  { name: 'LKG', level: -2, stage: 'pre_primary' },
  { name: 'UKG', level: -1, stage: 'pre_primary' },
  { name: 'I', level: 1, stage: 'primary' },
  { name: 'II', level: 2, stage: 'primary' },
  { name: 'III', level: 3, stage: 'primary' },
  { name: 'IV', level: 4, stage: 'primary' },
  { name: 'V', level: 5, stage: 'primary' },
  { name: 'VI', level: 6, stage: 'middle' },
  { name: 'VII', level: 7, stage: 'middle' },
  { name: 'VIII', level: 8, stage: 'middle' },
  { name: 'IX', level: 9, stage: 'secondary' },
  { name: 'X', level: 10, stage: 'secondary' },
  { name: 'XI', level: 11, stage: 'senior_secondary' },
  { name: 'XII', level: 12, stage: 'senior_secondary' },
] as const;

export const CBSE_SUBJECTS = [
  { code: 'ENG', name: 'English', type: 'core' },
  { code: 'HIN', name: 'Hindi', type: 'language' },
  { code: 'MATH', name: 'Mathematics', type: 'core' },
  { code: 'SCI', name: 'Science', type: 'core' },
  { code: 'SST', name: 'Social Science', type: 'core' },
  { code: 'EVS', name: 'Environmental Studies', type: 'core' },
  { code: 'PHY', name: 'Physics', type: 'core' },
  { code: 'CHE', name: 'Chemistry', type: 'core' },
  { code: 'BIO', name: 'Biology', type: 'core' },
  { code: 'CS', name: 'Computer Science', type: 'elective' },
  { code: 'PE', name: 'Physical Education', type: 'co_curricular' },
  { code: 'ART', name: 'Art Education', type: 'co_curricular' },
] as const;

export const CBSE_TERMS = [
  { name: 'Term 1', sequence: 1, type: 'term' as const },
  { name: 'Term 2', sequence: 2, type: 'term' as const },
];

/** ICSE uses similar structure with minor naming differences. */
export const ICSE_CLASSES = CBSE_CLASSES.map((c) => ({ ...c }));

export const ICSE_SUBJECTS = [
  ...CBSE_SUBJECTS,
  { code: 'FREN', name: 'French', type: 'language' },
];

export function classesForBoard(board: string, fromLevel: number, toLevel: number) {
  const source =
    board === 'icse' ? ICSE_CLASSES : CBSE_CLASSES;
  return source.filter((c) => c.level >= fromLevel && c.level <= toLevel);
}

export function subjectsForBoard(board: string) {
  return board === 'icse' ? ICSE_SUBJECTS : CBSE_SUBJECTS;
}
