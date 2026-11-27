/**
 * Batch 56: a facility's exam programmes gate what its portals serve.
 *
 * The centre document carries audienceTypes: the exam programmes picked at
 * signup (pre-selected from the facility-type registry, editable in the exam
 * chips). Whatever the facility picked decides which platform content its
 * portals show. The gate maps each TOS mock exam type to the programmes it
 * serves, so:
 *   - a JAMB mock reaches only facilities that prepare students for JAMB;
 *   - a WAEC/NECO mock reaches facilities that prepare for WAEC or NECO
 *     (one mock serves both exams);
 *   - a centre that records no programmes (older facilities) is ungated, the
 *     same fallback the student practice tab already uses, so nobody's
 *     calendar empties out because a field is missing.
 * Student practice filters the same way client-side (StudentPractice.tsx);
 * video resources filter by the student's own programme (batch 42). This
 * module puts the same rule on the mock routes, server-side.
 */
export function programmesForMockExam(examType: unknown): string[] {
  const et = String(examType || '').trim().toLowerCase();
  if (et === 'jamb') return ['jamb'];
  if (et === 'waec_neco') return ['waec', 'neco'];
  return [];
}

/** The predicate for one centre, or null when the centre records no
 * programmes and therefore sees everything. */
export function centreMockGate(audienceTypes: unknown): ((examType: string) => boolean) | null {
  const list = Array.isArray(audienceTypes)
    ? (audienceTypes as unknown[]).map((t) => String(t).trim().toLowerCase()).filter(Boolean)
    : [];
  if (!list.length) return null;
  const set = new Set(list);
  return (examType: string) => programmesForMockExam(examType).some((p) => set.has(p));
}
