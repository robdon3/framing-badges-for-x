import { postText } from './text.js';

const PERCENT = /\b\d{1,3}(?:\.\d+)?\s?%/g;
const DOLLAR = /\$\s?\d+(?:,\d{3})*(?:\.\d+)?/g;
const AMERICAN = /(?<![A-Za-z0-9])[+-]\d{3,4}\b/g;
const FRACTIONAL = /\b\d{1,3}\s*(?:\/|to|-)\s*\d{1,3}\b/i;
const ODDS_WORD = /\bodds\b/i;
const MARKET = /\b(?:polymarket|kalshi|predictit|metaculus|manifold|betfair|smarkets)\b/i;
const NUMBER = /\d/;

const TIMESTAMP = new RegExp(
  [
    '\\b\\d{4}-\\d{2}-\\d{2}(?:[t\\s]\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\s*z|utc)?)?\\b',
    '\\b\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:a\\.?m\\.?|p\\.?m\\.?|utc|gmt|et|pt|ct|mt|bst|cet)?\\b',
    '\\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b',
    '\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?(?:,?\\s+\\d{4})?\\b',
    '\\b(?:as of|as at|updated|timestamped)\\s+(?:mon|tue|wed|thu|fri|sat|sun)\\w*\\b',
  ].join('|'),
  'ig',
);

const NEAR = 48;

function sentencesOf(text) {
  const parts = [];
  const re = /\n+|(?<=[.!?])\s+/g;
  let last = 0;
  for (const match of text.matchAll(re)) {
    parts.push({ start: last, end: match.index, text: text.slice(last, match.index) });
    last = match.index + match[0].length;
  }
  parts.push({ start: last, end: text.length, text: text.slice(last) });
  return parts;
}

function stampSpans(text) {
  const spans = [];
  for (const match of text.matchAll(TIMESTAMP)) {
    spans.push({ start: match.index, end: match.index + match[0].length });
  }
  return spans;
}

function sentenceAt(sentences, index) {
  return sentences.find((sentence) => index >= sentence.start && index < sentence.end)
    || sentences[sentences.length - 1];
}

function isStamped(index, length, sentences, stamps) {
  const sentence = sentenceAt(sentences, index);
  if (stamps.some((stamp) => stamp.start < sentence.end && stamp.end > sentence.start)) return true;
  return stamps.some((stamp) => {
    const gap = stamp.start >= index + length ? stamp.start - (index + length) : index - stamp.end;
    return gap <= NEAR && gap >= 0;
  });
}

function collect(text, regex, kind) {
  const found = [];
  for (const match of text.matchAll(regex)) {
    found.push({ kind, raw: match[0], index: match.index, length: match[0].length });
  }
  return found;
}

export function findMarketNumbers(text) {
  const source = String(text || '');
  const sentences = sentencesOf(source);
  const found = [
    ...collect(source, PERCENT, 'percent'),
    ...collect(source, DOLLAR, 'dollar'),
    ...collect(source, AMERICAN, 'american-odds'),
  ];
  for (const sentence of sentences) {
    if (ODDS_WORD.test(sentence.text)) {
      const fractional = sentence.text.match(FRACTIONAL);
      if (fractional) {
        found.push({
          kind: 'odds',
          raw: fractional[0],
          index: sentence.start + sentence.text.indexOf(fractional[0]),
          length: fractional[0].length,
        });
      }
    }
    if (MARKET.test(sentence.text) && NUMBER.test(sentence.text)) {
      const digits = sentence.text.match(/\d+(?:\.\d+)?/);
      if (digits) {
        found.push({
          kind: 'market',
          raw: digits[0],
          index: sentence.start + sentence.text.indexOf(digits[0]),
          length: digits[0].length,
        });
      }
    }
  }
  return found;
}

export function uncoveredNumbers(text) {
  const source = String(text || '');
  const sentences = sentencesOf(source);
  const stamps = stampSpans(source);
  const seen = new Set();
  const open = [];
  for (const number of findMarketNumbers(source)) {
    const key = `${number.index}:${number.raw}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!isStamped(number.index, number.length, sentences, stamps)) open.push(number);
  }
  return open;
}

/**
 * The post's own publish time is not an as-of time for a quoted price.
 * A clock or calendar date has to sit in the same sentence, or within 48 characters.
 */
export function evaluateNumbers(snapshot) {
  const open = uncoveredNumbers(postText(snapshot));
  if (open.length === 0) return null;
  const shown = open.slice(0, 4).map((number) => number.raw.trim());
  return {
    ruleId: 'numbers',
    badge: 'unstamped',
    summary: 'Number or odds with no as-of time',
    why: `Number or odds with no as-of time: ${shown.join(', ')}. The post time does not date the figure.`,
  };
}
