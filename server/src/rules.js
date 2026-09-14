function rollDice(count = 5, nextValue = () => Math.floor(Math.random() * 6) + 1) {
  return Array.from({ length: count }, () => nextValue());
}

function isHigherBid(currentBid, nextBid) {
  if (!currentBid) return true;
  return nextBid.count > currentBid.count
    || (nextBid.count === currentBid.count && nextBid.face > currentBid.face);
}

function countFace(dice, face) {
  return dice.filter((value) => value === face).length;
}

function resolveBid(bid, actualCount) {
  return {
    bidIsCorrect: actualCount >= bid.count,
    actualCount,
  };
}

module.exports = {
  rollDice,
  isHigherBid,
  countFace,
  resolveBid,
};
