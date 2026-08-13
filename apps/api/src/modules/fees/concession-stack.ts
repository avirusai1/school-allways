/**
 * Concession stacking — percentages of gross, then flats, never past the line.
 * Every applied concession id is returned so invoice_lines keep a full audit trail.
 */

export interface ConcessionInput {
  id: string;
  /** Restrict to one head, or null/undefined for all concession-eligible heads. */
  feeHeadId?: string | null;
  percentageBp?: number | null;
  flatAmountPaise?: number | null;
}

export interface StackResult {
  concessionAmountPaise: number;
  netAmountPaise: number;
  appliedConcessionIds: string[];
}

/**
 * Apply approved concessions to one invoice line's gross.
 * Percentage concessions run first (each on the original gross); flats after.
 * Total concession is capped at gross.
 */
export function stackConcessions(
  grossPaise: number,
  concessions: ConcessionInput[],
  feeHeadId: string,
  allowsConcession: boolean,
): StackResult {
  if (!Number.isInteger(grossPaise) || grossPaise < 0) {
    throw new Error('grossPaise must be a non-negative integer (paise)');
  }
  if (!allowsConcession || concessions.length === 0 || grossPaise === 0) {
    return {
      concessionAmountPaise: 0,
      netAmountPaise: grossPaise,
      appliedConcessionIds: [],
    };
  }

  const applicable = concessions.filter(
    (c) => !c.feeHeadId || c.feeHeadId === feeHeadId,
  );

  const pct = applicable.filter(
    (c) => c.percentageBp != null && c.percentageBp > 0 && !(c.flatAmountPaise != null && c.flatAmountPaise > 0),
  );
  const flat = applicable.filter(
    (c) => c.flatAmountPaise != null && c.flatAmountPaise > 0,
  );

  let concession = 0;
  const applied: string[] = [];

  for (const c of pct) {
    const bp = c.percentageBp ?? 0;
    // bp is basis points: 10000 = 100%. Integer arithmetic only.
    const cut = Math.floor((grossPaise * bp) / 10_000);
    if (cut <= 0) continue;
    concession += cut;
    applied.push(c.id);
  }

  for (const c of flat) {
    const cut = c.flatAmountPaise ?? 0;
    if (cut <= 0) continue;
    concession += cut;
    applied.push(c.id);
  }

  if (concession > grossPaise) concession = grossPaise;

  return {
    concessionAmountPaise: concession,
    netAmountPaise: grossPaise - concession,
    appliedConcessionIds: applied,
  };
}
