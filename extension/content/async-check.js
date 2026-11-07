/**
 * Extension point for a check that runs after the framing rules.
 * The optional tone chip registers here and returns `{ hits: [], tone }`.
 * Hits would be merged into the framing badge. Tone must not be a hit.
 * There is still no network permission.
 */
export const asyncCheckers = [];

export function registerAsyncChecker(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('An async checker must be a function.');
  }
  asyncCheckers.push(fn);
  return () => {
    const index = asyncCheckers.indexOf(fn);
    if (index >= 0) asyncCheckers.splice(index, 1);
  };
}

export function clearAsyncCheckers() {
  asyncCheckers.length = 0;
}
