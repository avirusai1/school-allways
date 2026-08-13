import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';

export type AcademicSession = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  isLocked: boolean;
};

export type AcademicClass = {
  id: string;
  name: string;
  level: number;
  stage: string | null;
  stream: string | null;
  isActive: boolean;
};

export type AcademicSection = {
  id: string;
  name: string;
  classId: string;
  academicSessionId: string;
  capacity: number | null;
  studentCount: number;
};

export type SectionOption = {
  id: string;
  label: string;
  studentCount: number;
  level: number;
};

export type AcademicSubject = {
  id: string;
  code: string;
  name: string;
  type: string;
  isScholastic: boolean;
};

export type ClassSubjectLink = {
  classId: string;
  subjectId: string;
};

export type UnpaidDuesWarning = {
  type: 'unpaid_dues';
  count: number;
  totalPaise: number;
  studentIds: string[];
};

export type RolloverWarning = string | UnpaidDuesWarning;

export type RolloverPreview = {
  wouldCreate: { classes: number; sections: number; enrollments: number };
  wouldPromote: number;
  wouldDetain: number;
  wouldGraduate: number;
  warnings: RolloverWarning[];
  targetSessionId?: string;
};

export type BoardTemplate = 'cbse' | 'icse' | 'state';

export function useSessions(branchId: string | undefined) {
  return useQuery({
    queryKey: ['academic', 'sessions', branchId],
    enabled: Boolean(branchId),
    queryFn: () =>
      apiFetch<AcademicSession[]>(`/academic/sessions?branchId=${branchId}`),
  });
}

export function useClasses(branchId: string | undefined) {
  return useQuery({
    queryKey: ['academic', 'classes', branchId],
    enabled: Boolean(branchId),
    queryFn: () =>
      apiFetch<AcademicClass[]>(`/academic/classes?branchId=${branchId}`),
  });
}

export function useSections(
  branchId: string | undefined,
  academicSessionId: string | undefined,
) {
  return useQuery({
    queryKey: ['academic', 'sections', branchId, academicSessionId],
    enabled: Boolean(branchId && academicSessionId),
    queryFn: () => {
      const q = new URLSearchParams({ branchId: branchId! });
      if (academicSessionId) q.set('academicSessionId', academicSessionId);
      return apiFetch<AcademicSection[]>(`/academic/sections?${q}`);
    },
  });
}

export function useSubjects(branchId: string | undefined) {
  return useQuery({
    queryKey: ['academic', 'subjects', branchId],
    enabled: Boolean(branchId),
    queryFn: () =>
      apiFetch<AcademicSubject[]>(`/academic/subjects?branchId=${branchId}`),
  });
}

export function useClassSubjectLinks(academicSessionId: string | undefined) {
  return useQuery({
    queryKey: ['academic', 'class-subjects', academicSessionId],
    enabled: Boolean(academicSessionId),
    queryFn: () =>
      apiFetch<ClassSubjectLink[]>(
        `/academic/class-subjects?academicSessionId=${academicSessionId}`,
      ),
  });
}

export function useAcademicMutations(branchId: string | undefined) {
  const qc = useQueryClient();
  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ['academic'] });
  };

  const applyTemplate = useMutation({
    mutationFn: (body: {
      board: BoardTemplate;
      academicSessionId: string;
      include: Array<'classes' | 'subjects' | 'grading_scale' | 'terms'>;
    }) =>
      apiFetch<{
        classesCreated: number;
        subjectsCreated: number;
        termsCreated: number;
      }>('/academic/templates/apply', {
        method: 'POST',
        body: JSON.stringify({ branchId, ...body }),
      }),
    onSuccess: invalidate,
  });

  const saveClasses = useMutation({
    mutationFn: (body: {
      academicSessionId: string;
      classes: Array<{
        id?: string;
        name: string;
        level: number;
        stage?: string;
        stream?: string;
        sections: Array<{ name: string; capacity?: number }>;
      }>;
    }) =>
      apiFetch('/academic/classes/batch', {
        method: 'POST',
        body: JSON.stringify({ branchId, ...body }),
      }),
    onSuccess: invalidate,
  });

  const saveSubjects = useMutation({
    mutationFn: (body: {
      academicSessionId: string;
      subjects: Array<{
        id?: string;
        code: string;
        name: string;
        type: string;
        isScholastic: boolean;
        classIds: string[];
      }>;
    }) =>
      apiFetch('/academic/subjects/batch', {
        method: 'POST',
        body: JSON.stringify({ branchId, ...body }),
      }),
    onSuccess: invalidate,
  });

  const createSession = useMutation({
    mutationFn: (body: {
      name: string;
      startDate: string;
      endDate: string;
      isCurrent?: boolean;
    }) =>
      apiFetch('/academic/sessions', {
        method: 'POST',
        body: JSON.stringify({ branchId, ...body }),
      }),
    onSuccess: invalidate,
  });

  const rollover = useMutation({
    mutationFn: (args: {
      sessionId: string;
      dryRun: boolean;
      body: {
        targetSessionName: string;
        targetStartDate?: string;
        targetEndDate?: string;
        promotionRules: {
          defaultAction: 'promote' | 'detain';
          detained?: string[];
          graduatingClassLevel?: number;
        };
        carryForward?: {
          rollNumbers?: boolean;
          houses?: boolean;
          transport?: boolean;
          concessions?: boolean;
        };
      };
    }) =>
      apiFetch<RolloverPreview>(
        `/academic/sessions/${args.sessionId}/rollover?dryRun=${args.dryRun}`,
        {
          method: 'POST',
          body: JSON.stringify(args.body),
        },
      ),
    onSuccess: (_data, vars) => {
      if (!vars.dryRun) void invalidate();
    },
  });

  return { applyTemplate, saveClasses, saveSubjects, createSession, rollover };
}

/**
 * Sections labelled "V-A" and ordered by class level — the order a school
 * expects, and the order step 9 uses to pick its default section.
 */
export function toSectionOptions(
  sections: AcademicSection[] | undefined,
  classes: AcademicClass[] | undefined,
): SectionOption[] {
  if (!sections?.length) return [];
  const byId = new Map((classes ?? []).map((c) => [c.id, c]));
  return sections
    .map((s) => {
      const cls = byId.get(s.classId);
      return {
        id: s.id,
        label: `${cls?.name ?? 'Class'}-${s.name}`,
        studentCount: s.studentCount ?? 0,
        level: cls?.level ?? 0,
      };
    })
    .sort((a, b) => a.level - b.level || a.label.localeCompare(b.label));
}

export function pickCurrentSession(
  sessions: AcademicSession[] | undefined,
): AcademicSession | undefined {
  if (!sessions?.length) return undefined;
  return sessions.find((s) => s.isCurrent) ?? sessions[sessions.length - 1];
}
