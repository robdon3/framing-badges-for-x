import { postText } from './text.js';

/** More than about 48 hours. Exactly 48 does not fire. */
export const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

export const NEWS_FRAME_RE = /\b(breaking|developing|happening\s+now|latest|urgent|tonight|this\s+morning|this\s+afternoon|this\s+evening|right\s+now|new\s+report|exclusive|just\s+announced)\b|\bjust\s+in\b(?!\s+(?:time|case|for)\b)/i;

const MONTHS = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sept: 8, sep: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

function utc(year, month, day) {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const ms = Date.UTC(year, month, day);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month || check.getUTCDate() !== day) {
    return null;
  }
  return ms;
}

/**
 * Visible dates we will trust: ISO, datetime values, and month-name dates.
 * Numeric slash dates are not parsed. Locale is a guess, and the standard says not to guess.
 */
export function parseVisibleDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}(?:[t\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:z|[+-]\d{2}:?\d{2})?)?$/i.test(text)) {
    const ms = Date.parse(text);
    return Number.isNaN(ms) ? null : ms;
  }
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})(?:[t\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:z|utc)?)?\b/i);
  if (iso) {
    const ms = Date.UTC(
      Number(iso[1]),
      Number(iso[2]) - 1,
      Number(iso[3]),
      iso[4] ? Number(iso[4]) : 0,
      iso[5] ? Number(iso[5]) : 0,
      iso[6] ? Number(iso[6]) : 0,
    );
    return Number.isNaN(ms) ? null : ms;
  }
  const monthFirst = text.match(/\b(january|february|march|april|may|june|july|august|september|sept|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(\d{4})\b/i);
  if (monthFirst) {
    return utc(Number(monthFirst[3]), MONTHS[monthFirst[1].toLowerCase()], Number(monthFirst[2]));
  }
  const dayFirst = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|sept|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\.?(?:,)?\s+(\d{4})\b/i);
  if (dayFirst) {
    return utc(Number(dayFirst[3]), MONTHS[dayFirst[2].toLowerCase()], Number(dayFirst[1]));
  }
  return null;
}

export function isNewsFramed(text) {
  return NEWS_FRAME_RE.test(text || '');
}

export function evaluateFreshness(snapshot, context = {}) {
  if (!snapshot?.articleDateISO) return null;
  const articleMs = Date.parse(snapshot.articleDateISO);
  if (Number.isNaN(articleMs)) return null;
  const postMs = snapshot.postDateISO ? Date.parse(snapshot.postDateISO) : NaN;
  const nowMs = context.now ? new Date(context.now).getTime() : Date.now();
  const reference = Number.isNaN(postMs) ? nowMs : postMs;
  const age = reference - articleMs;
  if (!(age > FORTY_EIGHT_HOURS_MS)) return null;
  if (!isNewsFramed(postText(snapshot))) return null;
  const hours = Math.round(age / 36e5);
  const compared = Number.isNaN(postMs) ? 'the current clock' : 'the post time';
  return {
    ruleId: 'freshness',
    badge: 'recycled',
    summary: 'Old link framed as news',
    why: `The visible linked date ${snapshot.articleDateISO} is about ${hours} hours before ${compared}, past 48 hours, and the post still frames it as news. No date was guessed.`,
  };
}
