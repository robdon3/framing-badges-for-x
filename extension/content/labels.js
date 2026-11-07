/**
 * Badge precedence, highest first. No rule means no framing badge.
 * There is no Opinion badge: no rule detects opinion framing. An unstamped
 * price or odds figure is its own label, not an opinion.
 */
export const BADGE_PRECEDENCE = ['claim', 'unstamped', 'alarm', 'recycled', 'bait'];

export const BADGE_LABELS = {
  claim: 'Claim',
  unstamped: 'Unstamped',
  alarm: 'Alarm',
  recycled: 'Recycled',
  bait: 'Bait',
};

export const DISCLAIMER = 'It scores framing, not truth.';

export function pickBadge(hits) {
  const list = Array.isArray(hits) ? hits : [];
  for (const badge of BADGE_PRECEDENCE) {
    if (list.some((hit) => hit && hit.badge === badge)) return badge;
  }
  return null;
}

export function sortHits(hits) {
  const rank = new Map(BADGE_PRECEDENCE.map((badge, index) => [badge, index]));
  return [...hits].sort((a, b) => (rank.get(a.badge) ?? 99) - (rank.get(b.badge) ?? 99));
}
