import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateNumbers } from '../../extension/rules/numbers.js';
import { snapshot } from '../helpers.js';

describe('numbers', () => {
  it('flags percents, dollar prices, odds, and prediction markets with no timestamp', () => {
    assert.match(evaluateNumbers(snapshot({ text: 'Yes is trading at 62% on the contract.' })).why, /62%/);
    assert.match(evaluateNumbers(snapshot({ text: 'The share is $0.62.' })).why, /\$0\.62/);
    const odds = evaluateNumbers(snapshot({ text: 'Odds are 5/2 on the vote.' }));
    assert.equal(odds.badge, 'unstamped');
    assert.match(odds.why, /Number or odds with no as-of time/);
    assert.equal(evaluateNumbers(snapshot({ text: 'The contract is +150 with no as-of time.' })).badge, 'unstamped');
    assert.equal(evaluateNumbers(snapshot({ text: 'Polymarket contract last traded 0.62.' })).badge, 'unstamped');
  });

  it('accepts an as-of clock or calendar date next to the figure', () => {
    assert.equal(evaluateNumbers(snapshot({ text: 'Kalshi Yes is 62% as of 14:05 UTC.' })), null);
    assert.equal(evaluateNumbers(snapshot({ text: 'The share is $0.62 as of November 6, 2026.' })), null);
  });

  it('does not let the post publish time or a distant date stamp the figure', () => {
    assert.equal(evaluateNumbers(snapshot({
      text: 'The quoted price is $1.',
      postDateISO: '2026-11-07T11:30:00.000Z',
    })).badge, 'unstamped');
    const far = `The share is $0.62. ${'padding '.repeat(20)}Noted on November 1, 2024.`;
    assert.equal(evaluateNumbers(snapshot({ text: far })).badge, 'unstamped');
    assert.equal(evaluateNumbers(snapshot({ text: 'The hearing is tomorrow.' })), null);
  });
});
