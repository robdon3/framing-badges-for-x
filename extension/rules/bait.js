import { LEXICON } from './lexicon.js';
import { postText } from './text.js';

/** At least three strong outrage words, or two when the compound score is very negative. */
export const OUTRAGE_MIN_STRONG = 3;
export const OUTRAGE_STRONG_FLOOR = 2;
export const OUTRAGE_COMPOUND = -0.7;

const BOOSTERS = {
  very: 0.293,
  extremely: 0.4,
  really: 0.293,
  so: 0.293,
  incredibly: 0.35,
  utterly: 0.4,
  highly: 0.25,
  totally: 0.35,
  absolutely: 0.35,
  completely: 0.35,
  remarkably: 0.3,
  particularly: 0.2,
  especially: 0.2,
  enormously: 0.4,
};

const DAMPENERS = {
  barely: 0.293,
  slightly: 0.293,
  somewhat: 0.2,
  kinda: 0.2,
  marginally: 0.2,
};

const NEGATIONS = new Set([
  'not', 'no', 'never', 'neither', 'nor', 'nothing', 'nobody', 'nowhere',
  'cannot', 'cant', 'without', 'hardly', 'rarely', 'scarcely',
]);

export const BAIT_PHRASES = [
  { label: 'RT if', re: /\brt\s+if\b/i },
  { label: 'retweet if', re: /\bretweet\s+if\b/i },
  { label: 'like if', re: /\blike\s+if\b/i },
  { label: 'share if', re: /\bshare\s+if\b/i },
  { label: 'nobody is talking about', re: /\b(?:nobody|no\s+one)\s+is\s+talking\s+about\b/i },
  { label: "don't want you to know", re: /\bdon'?t\s+want\s+you\s+to\s+know\b/i },
  { label: "the media won't tell you", re: /\b(?:the\s+)?media\s+(?:won'?t|will\s+not|doesn'?t|do\s+not)\s+(?:tell|show)\s+you\b/i },
  { label: "you won't believe", re: /\byou\s+won'?t\s+believe\b/i },
  { label: 'open your eyes', re: /\bopen\s+your\s+eyes\b/i },
  { label: 'share this before', re: /\bshare\s+this\s+before\b/i },
  { label: 'what they are hiding', re: /\bwhat\s+they(?:'re|\s+are)\s+hiding\b/i },
  { label: 'this will be deleted', re: /\bthis\s+will\s+be\s+deleted\b/i },
  { label: 'wake up people', re: /\bwake\s+up(?:,)?\s+(?:people|sheeple|america|everyone)\b/i },
];

function tokenize(text) {
  const normalized = text
    .replace(/[’‘]/g, "'")
    .replace(/\b(can|do|does|did|is|are|was|were|won|would|should|could|must|have|has|had)n't\b/gi, '$1 not')
    .replace(/\bwon't\b/gi, 'will not');
  return normalized.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];
}

export function scoreSentiment(text) {
  const raw = tokenize(String(text || ''));
  const lower = raw.map((token) => token.toLowerCase());
  const butIndex = lower.lastIndexOf('but');
  let sum = 0;
  let strongNegativeHits = 0;
  const examples = [];
  for (let i = 0; i < raw.length; i += 1) {
    const word = lower[i];
    if (!(word in LEXICON)) continue;
    let valence = LEXICON[word];
    const original = raw[i];
    if (original.length > 1 && original === original.toUpperCase() && /[A-Z]/.test(original)) {
      valence += valence >= 0 ? 0.733 : -0.733;
    }
    for (let distance = 1; distance <= 3; distance += 1) {
      const previous = lower[i - distance];
      if (!previous) break;
      if (NEGATIONS.has(previous)) {
        valence *= -0.74;
        break;
      }
      if (BOOSTERS[previous]) {
        valence += valence < 0 ? -BOOSTERS[previous] : BOOSTERS[previous];
      } else if (DAMPENERS[previous]) {
        valence += valence < 0 ? DAMPENERS[previous] : -DAMPENERS[previous];
      }
    }
    if (butIndex !== -1) valence *= i < butIndex ? 0.5 : 1.5;
    if (valence <= -2) {
      strongNegativeHits += 1;
      if (examples.length < 5) examples.push(word);
    }
    sum += valence;
  }
  const exclaims = (String(text || '').match(/!/g) || []).length;
  if (exclaims && sum !== 0) sum += Math.sign(sum) * Math.min(exclaims, 4) * 0.292;
  const compound = sum === 0 ? 0 : sum / Math.sqrt(sum * sum + 15);
  return {
    compound: Math.round(compound * 1000) / 1000,
    strongNegativeHits,
    examples,
  };
}

export function isOutrage(sentiment) {
  return sentiment.strongNegativeHits >= OUTRAGE_MIN_STRONG
    || (sentiment.strongNegativeHits >= OUTRAGE_STRONG_FLOOR && sentiment.compound <= OUTRAGE_COMPOUND);
}

export function findBaitPhrases(text) {
  return BAIT_PHRASES.filter((phrase) => phrase.re.test(text)).map((phrase) => phrase.label);
}

export function evaluateBait(snapshot) {
  const text = postText(snapshot);
  const phrases = findBaitPhrases(text);
  const sentiment = scoreSentiment(text);
  const outrage = isOutrage(sentiment);
  if (phrases.length === 0 && !outrage) return null;
  const parts = [];
  if (phrases.length) {
    parts.push(`Engagement phrase: ${phrases.map((phrase) => `“${phrase}”`).join(', ')}.`);
  }
  if (outrage) {
    parts.push(`Outrage lexicon compound ${sentiment.compound.toFixed(2)} from ${sentiment.strongNegativeHits} strong negative words. Sentiment is not evidence.`);
  }
  return {
    ruleId: 'bait',
    badge: 'bait',
    summary: 'Engagement bait or outrage framing',
    why: parts.join(' '),
  };
}
