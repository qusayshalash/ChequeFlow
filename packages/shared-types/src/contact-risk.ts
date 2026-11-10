/**
 * How much watching a contact needs, from how its cheques have gone.
 *
 * One rule for every screen that shows it (the dashboard's list, the
 * contact's own page), so the two cannot call the same contact "high" and
 * "medium". High: a returned cheque still open, or at least three decided
 * cheques with three in ten coming back. Medium: has bounced before. Low: a
 * clean record so far.
 */
export type ContactRiskLevel = 'high' | 'medium' | 'low';

export function contactRiskLevel(counts: {
  decided: number;
  bounced: number;
  openBounced: number;
}): ContactRiskLevel {
  if (counts.openBounced > 0) return 'high';
  if (counts.decided >= 3 && counts.bounced / counts.decided >= 0.3) return 'high';
  return counts.bounced > 0 ? 'medium' : 'low';
}
