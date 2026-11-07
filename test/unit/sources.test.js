import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyAuthor, normalizeHandle, parseHandleList } from '../../extension/rules/sources.js';
import { recordFlag } from '../../extension/storage/state.js';

describe('sources', () => {
  it('normalizes handles and skips junk lines', () => {
    assert.equal(normalizeHandle(' @Reuters '), 'reuters');
    assert.equal(normalizeHandle('https://x.com/ap'), 'ap');
    const parsed = parseHandleList('@Reuters\n\n# note\nreuters\nnot a handle\nhttps://x.com/BBC\n');
    assert.deepEqual(parsed.handles, ['reuters', 'bbc']);
    assert.deepEqual(parsed.skipped, ['not a handle']);
  });

  it('classifies trusted, noisy, both, and unlisted', () => {
    const lists = { trustedHandles: ['reuters'], noisyHandles: ['noisy_desk', 'reuters'] };
    assert.equal(classifyAuthor('@Reuters', lists).list, 'both');
    assert.equal(classifyAuthor('noisy_desk', lists).list, 'noisy');
    assert.equal(classifyAuthor('clean_desk', lists).list, 'unlisted');
    assert.equal(classifyAuthor('', lists).handle, 'unknown');
  });

  it('counts a flag once per post id and keeps the count for that handle', () => {
    const first = recordFlag({ trustedHandles: [], noisyHandles: [] }, '@Noisy_Desk', '3001');
    assert.equal(first.changed, true);
    assert.equal(first.state.authorFlagCounts.noisy_desk, 1);
    const again = recordFlag(first.state, 'noisy_desk', '3001');
    assert.equal(again.changed, false);
    assert.equal(again.state.authorFlagCounts.noisy_desk, 1);
    const second = recordFlag(again.state, 'noisy_desk', '3002');
    assert.equal(second.state.authorFlagCounts.noisy_desk, 2);
    const clean = recordFlag(second.state, 'trusted_desk', '');
    assert.equal(clean.state.authorFlagCounts.trusted_desk, 1);
    assert.equal(clean.state.countedPostIds.includes('3001'), true);
  });
});
