import { postText } from './text.js';

/** Siren / alarm glyphs only. A generic warning in an image alt still counts when the alt is in the text. */
export const ALARM_EMOJI = /\u{1F6A8}|\u{203C}\uFE0F?|\u{26A0}\uFE0F?|\u{1F198}|\u{1F514}|\u{1F534}|\u{1F4E2}/u;

const ANONYMOUS = new Set([
  'sources', 'source', 'officials', 'official', 'reports', 'report',
  'rumors', 'rumours', 'rumor', 'rumour', 'media', 'insiders', 'insider',
  'witnesses', 'witness', 'authorities', 'authority', 'someone', 'people',
]);

/** Multi-word names use includes; short names use a word boundary so "happy" is not "ap". */
const OUTLETS = [
  'reuters',
  'associated press',
  'ap news',
  'bbc',
  'cnn',
  'bloomberg',
  'the new york times',
  'new york times',
  'washington post',
  'wall street journal',
  'financial times',
  'the guardian',
  'al jazeera',
  'npr',
  'politico',
  'axios',
  'afp',
  'agence france-presse',
  'abc news',
  'cbs news',
  'nbc news',
  'fox news',
  'the hill',
  'white house',
  'pentagon',
  'supreme court',
  'united nations',
  'european commission',
];

const JUST_IN = /\bjust\s+in\b(?!\s+(?:time|case|for)\b)/i;

export function isMostlyCaps(text) {
  const cleaned = String(text || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/@\w+/g, ' ');
  const words = cleaned.split(/[^A-Za-z]+/).filter((word) => word.length >= 4);
  if (words.length < 4) return false;
  const caps = words.filter((word) => word === word.toUpperCase() && /[A-Z]/.test(word));
  return caps.length / words.length >= 0.6;
}

export function urgencySignals(text) {
  const signals = [];
  if (/\bbreaking\b/i.test(text)) signals.push('BREAKING');
  if (JUST_IN.test(text)) signals.push('JUST IN');
  if (ALARM_EMOJI.test(text)) signals.push('a siren or alarm emoji');
  if (isMostlyCaps(text)) signals.push('mostly-caps text');
  return signals;
}

function mentionsOutlet(text) {
  const lower = text.toLowerCase();
  return OUTLETS.some((outlet) => {
    if (outlet.includes(' ')) return lower.includes(outlet);
    return new RegExp(`\\b${outlet}\\b`, 'i').test(text);
  });
}

/**
 * A named source is an @mention, a known outlet, or "according to <Name>".
 * "Officials" and "sources" are anonymous, so they do not clear Alarm.
 * The author handle in the header is not a source; only names in the post text count.
 */
export function hasNamedSource(snapshot) {
  const text = postText(snapshot);
  if (/@[A-Za-z0-9_]{1,15}\b/.test(text)) return true;
  if (Array.isArray(snapshot?.mentions) && snapshot.mentions.length > 0) return true;
  if (mentionsOutlet(text)) return true;
  const named = text.matchAll(
    /\baccording\s+to\s+(?:the\s+)?([A-Z][\p{L}0-9&.'’-]+(?:\s+[A-Z][\p{L}0-9&.'’-]+){0,4})/gu,
  );
  for (const match of named) {
    const first = match[1].split(/\s+/)[0].toLowerCase();
    if (!ANONYMOUS.has(first)) return true;
  }
  return false;
}

export function evaluateUrgency(snapshot) {
  const text = postText(snapshot);
  const signals = urgencySignals(text);
  if (signals.length === 0) return null;
  if (snapshot?.hasLink === true) return null;
  if (hasNamedSource(snapshot)) return null;
  return {
    ruleId: 'urgency',
    badge: 'alarm',
    summary: 'Urgency framing without a source',
    why: `Matched ${signals.join(' and ')}. The post has no link and no named source.`,
  };
}
