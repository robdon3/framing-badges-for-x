import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { clearAsyncCheckers, registerAsyncChecker } from '../../extension/content/async-check.js';
import { pickBadge } from '../../extension/content/labels.js';
import { scorePost, scorePostWithAsync } from '../../extension/content/scorer.js';
import { snapshot } from '../helpers.js';

after(() => clearAsyncCheckers());

describe('scorer precedence', () => {
  it('ranks Claim, then Unstamped, Alarm, Recycled, then Bait', () => {
    assert.equal(pickBadge([
      { badge: 'bait' },
      { badge: 'alarm' },
      { badge: 'claim' },
      { badge: 'unstamped' },
    ]), 'claim');
    assert.equal(pickBadge([{ badge: 'alarm' }, { badge: 'unstamped' }]), 'unstamped');
    assert.equal(pickBadge([{ badge: 'bait' }, { badge: 'recycled' }]), 'recycled');
    assert.equal(pickBadge([{ badge: 'bait' }]), 'bait');
    assert.equal(pickBadge([]), null);
  });

  it('keeps every hit and still shows the winning badge', () => {
    const result = scorePost(snapshot({
      text: 'BREAKING: officials claim it is 62% and $0.62. RT if you saw this.',
    }));
    assert.equal(result.badge, 'claim');
    assert.deepEqual(result.hits.map((hit) => hit.ruleId).sort(), ['attribution', 'bait', 'numbers', 'urgency']);
  });

  it('starts with no async checkers and can accept one later', async () => {
    const post = snapshot({ text: 'Here is the meeting agenda for Thursday.' });
    assert.equal((await scorePostWithAsync(post)).badge, null);
    const unregister = registerAsyncChecker(async () => ({
      hits: [{ ruleId: 'model-check', badge: 'claim', summary: 'Extra', why: 'A future checker attached this note.' }],
      note: 'Example checker finished.',
    }));
    const checked = await scorePostWithAsync(post);
    assert.equal(checked.badge, 'claim');
    assert.equal(checked.asyncNote, 'Example checker finished.');
    unregister();
    clearAsyncCheckers();
    assert.equal((await scorePostWithAsync(post)).badge, null);
  });
});
