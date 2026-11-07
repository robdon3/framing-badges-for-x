import { asyncCheckers } from './async-check.js';
import { BADGE_LABELS, pickBadge } from './labels.js';
import { RULES } from '../rules/index.js';
import { authorKey, classifyAuthor } from '../rules/sources.js';

export { BADGE_LABELS, pickBadge };

export function scorePost(snapshot, context = {}) {
  const hits = [];
  const errors = [];
  for (const rule of RULES) {
    try {
      const hit = rule.evaluate(snapshot, context);
      if (hit?.badge) hits.push(hit);
    } catch {
      errors.push({
        ruleId: rule.id,
        badge: null,
        summary: 'Rule error',
        why: `${rule.id} failed open and was skipped.`,
      });
    }
  }
  return finalize(snapshot, hits, context, errors);
}

export async function collectAsyncResult(snapshot, context = {}) {
  const hits = [];
  const notes = [];
  let tone;
  let sawTone = false;
  for (const checker of asyncCheckers) {
    try {
      const result = await checker(snapshot, context);
      if (result?.hits?.length) hits.push(...result.hits.filter((hit) => hit?.badge));
      if (result?.note) notes.push(result.note);
      if (result && Object.prototype.hasOwnProperty.call(result, 'tone')) {
        sawTone = true;
        tone = result.tone;
      }
    } catch {
      notes.push('Extra check failed.');
    }
  }
  const extra = { hits, note: notes.join(' ') };
  if (sawTone) extra.tone = tone;
  return extra;
}

export async function scorePostWithAsync(snapshot, context = {}) {
  const base = scorePost(snapshot, context);
  const extra = await collectAsyncResult(snapshot, context);
  if (extra.hits.length === 0 && !extra.note && !Object.prototype.hasOwnProperty.call(extra, 'tone')) return base;
  const merged = finalize(snapshot, [...base.hits, ...extra.hits], context, base.errors);
  if (extra.note) merged.asyncNote = extra.note;
  if (Object.prototype.hasOwnProperty.call(extra, 'tone')) merged.tone = extra.tone;
  return merged;
}

function finalize(snapshot, hits, context, errors) {
  const author = classifyAuthor(snapshot?.authorHandle, context);
  const flagCount = context.authorFlagCounts?.[authorKey(snapshot?.authorHandle)] ?? 0;
  return {
    badge: pickBadge(hits),
    hits,
    errors,
    author: { ...author, flagCount },
    snapshotId: snapshot?.id || '',
    asyncNote: null,
  };
}
