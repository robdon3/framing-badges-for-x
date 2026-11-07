import { postText } from './text.js';

const SKIP_NAME = new Set([
  'he', 'she', 'they', 'we', 'i', 'you', 'it', 'this', 'that', 'there', 'what',
  'who', 'which', 'these', 'those', 'someone', 'somebody', 'anyone', 'anybody',
  'everyone', 'everybody', 'people', 'nobody', 'one', 'some', 'many', 'others',
  'few', 'both', 'each', 'all', 'none', 'nothing', 'something', 'users', 'folks',
  'sources', 'source', 'officials', 'official', 'reports', 'report', 'authorities',
  'authority', 'insiders', 'insider', 'witnesses', 'witness',
]);

const PATTERNS = [
  { label: 'reportedly', re: /\breportedly\b/i },
  { label: 'allegedly', re: /\ballegedly\b/i },
  { label: 'purportedly', re: /\bpurportedly\b/i },
  { label: 'sources say', re: /\bsources?\s+(?:say|said|claim|claims|claimed)\b/i },
  { label: 'officials claim', re: /\bofficials?\s+(?:say|said|claim|claims|claimed)\b/i },
  { label: 'authorities say', re: /\bauthorities\s+(?:say|said|claim|claims|claimed)\b/i },
  { label: 'according to sources', re: /\baccording\s+to\s+(?:sources|officials|reports|a\s+report)\b/i },
  { label: 'people familiar with', re: /\b(?:people|persons)\s+familiar\s+with\b/i },
  { label: 'reports say', re: /\breports?\s+say\b/i },
];

const NAME_SAYS = /\b([A-Z][\p{L}'’.-]{1,40}(?:\s+[A-Z][\p{L}'’.-]{1,40}){0,3})\s+(says|said|claims|claimed)\b/gu;

export function findClaimPhrases(text) {
  const found = [];
  const seen = new Set();
  const push = (label) => {
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    found.push(label);
  };
  for (const pattern of PATTERNS) {
    if (pattern.re.test(text)) push(pattern.label);
  }
  for (const match of text.matchAll(NAME_SAYS)) {
    const first = match[1].split(/\s+/)[0].toLowerCase();
    if (SKIP_NAME.has(first)) continue;
    push(`${match[1]} ${match[2].toLowerCase()}`);
  }
  return found;
}

export function evaluateAttribution(snapshot) {
  const phrases = findClaimPhrases(postText(snapshot));
  if (phrases.length === 0) return null;
  const catalog = new Set(PATTERNS.map((pattern) => pattern.label.toLowerCase()));
  const listed = phrases.filter((phrase) => catalog.has(phrase.toLowerCase())).slice(0, 4);
  const why = listed.length
    ? `Attribution language, not a checked fact: ${listed.map((phrase) => `“${phrase}”`).join(', ')}.`
    : 'Attribution language, not a checked fact.';
  return {
    ruleId: 'attribution',
    badge: 'claim',
    summary: 'One-sided attribution',
    why,
  };
}
