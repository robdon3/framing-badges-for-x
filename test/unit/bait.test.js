import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateBait, scoreSentiment } from '../../extension/rules/bait.js';
import { LEXICON } from '../../extension/rules/lexicon.js';
import { snapshot } from '../helpers.js';

describe('bait', () => {
  it('bundles a local lexicon and does not need a network', () => {
    assert.ok(Object.keys(LEXICON).length >= 100);
    assert.equal(typeof LEXICON.disgusting, 'number');
  });

  it('flags engagement phrases', () => {
    assert.match(evaluateBait(snapshot({ text: 'RT if you want the agenda posted.' })).why, /RT if/);
    assert.match(evaluateBait(snapshot({ text: 'Nobody is talking about the hearing agenda.' })).why, /nobody is talking about/i);
    assert.match(evaluateBait(snapshot({ text: "They don't want you to know what was signed." })).why, /don't want you to know/i);
    assert.equal(evaluateBait(snapshot({ text: 'Wake up at 6 and read the bill.' })), null);
  });

  it('flags a pile of outrage words and ignores mild or ordinary wording', () => {
    const outrage = evaluateBait(snapshot({
      text: 'This is disgusting, outrageous, and corrupt. They are lying scum and it is shameful.',
    }));
    assert.equal(outrage.badge, 'bait');
    assert.match(outrage.why, /Outrage lexicon/);
    assert.equal(evaluateBait(snapshot({ text: 'Here is the meeting agenda for Thursday.' })), null);
    assert.equal(evaluateBait(snapshot({ text: 'This is a bad draft of the agenda.' })), null);
    assert.equal(evaluateBait(snapshot({ text: 'Two people were killed in the storm.' })), null);
    assert.equal(evaluateBait(snapshot({ text: 'This is disgusting.' })), null);
  });

  it('scores caps, boosters, and negation in the VADER style', () => {
    const plain = scoreSentiment('disgusting');
    const yelled = scoreSentiment('DISGUSTING');
    const boosted = scoreSentiment('absolutely disgusting');
    const negated = scoreSentiment('not happy');
    assert.ok(yelled.compound < plain.compound);
    assert.ok(boosted.compound < plain.compound);
    assert.ok(negated.compound < 0);
  });
});
