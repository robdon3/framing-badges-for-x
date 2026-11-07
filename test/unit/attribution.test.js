import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateAttribution } from '../../extension/rules/attribution.js';
import { snapshot } from '../helpers.js';

describe('attribution', () => {
  it('labels officials, sources, reportedly, allegedly, and X says as claims', () => {
    assert.match(evaluateAttribution(snapshot({ text: 'Officials claim the bridge was closed.' })).why, /officials claim/i);
    assert.match(evaluateAttribution(snapshot({ text: 'Sources say the vote flipped overnight.' })).why, /sources say/i);
    assert.equal(evaluateAttribution(snapshot({ text: 'The pier reportedly closed at noon.' })).badge, 'claim');
    assert.equal(evaluateAttribution(snapshot({ text: 'The fund was allegedly empty by Friday.' })).badge, 'claim');
    const named = evaluateAttribution(snapshot({ text: 'Mayor Adams says the fund is empty.' }));
    assert.equal(named.badge, 'claim');
    assert.equal(named.why.includes('Mayor Adams'), false);
    assert.match(named.why, /Attribution language/);
  });

  it('does not treat a pronoun or a plain sentence as a claim', () => {
    assert.equal(evaluateAttribution(snapshot({ text: 'She says the fund is empty.' })), null);
    assert.equal(evaluateAttribution(snapshot({ text: 'The city closed the bridge at 4pm.' })), null);
  });
});
