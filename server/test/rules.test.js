const test = require('node:test');
const assert = require('node:assert/strict');
const { rollDice, isHigherBid, countFace, resolveBid } = require('../src/rules');

test('bids must increase by count, then face', () => {
  assert.equal(isHigherBid(null, { count: 1, face: 1 }), true);
  assert.equal(isHigherBid({ count: 2, face: 3 }, { count: 2, face: 4 }), true);
  assert.equal(isHigherBid({ count: 2, face: 3 }, { count: 3, face: 1 }), true);
  assert.equal(isHigherBid({ count: 2, face: 3 }, { count: 2, face: 3 }), false);
  assert.equal(isHigherBid({ count: 2, face: 3 }, { count: 1, face: 6 }), false);
});

test('dice can be counted and a bid can be resolved', () => {
  const dice = rollDice(5, () => 4);
  assert.deepEqual(dice, [4, 4, 4, 4, 4]);
  assert.equal(countFace(dice, 4), 5);
  assert.deepEqual(resolveBid({ count: 4, face: 4 }, 5), { bidIsCorrect: true, actualCount: 5 });
  assert.deepEqual(resolveBid({ count: 6, face: 4 }, 5), { bidIsCorrect: false, actualCount: 5 });
});
