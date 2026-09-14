const http = require('node:http');
const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');
const { rollDice, isHigherBid, countFace, resolveBid } = require('./rules');

const PORT = Number(process.env.PORT || 8787);
const MAX_PLAYERS = 8;
const DICE_PER_PLAYER = 5;
const CHAT_LIMIT = 60;
const rooms = new Map();
const clients = new Map();

function randomId() {
  return crypto.randomBytes(4).toString('hex');
}

function randomRoomCode() {
  let code;
  do {
    code = crypto.randomBytes(3).toString('hex').slice(0, 6).toUpperCase();
  } while (rooms.has(code));
  return code;
}

function cleanNickname(value) {
  return String(value || '').trim().replace(/[<>]/g, '').slice(0, 16) || '玩家';
}

function cleanPlayerId(value) {
  return String(value || '').trim().slice(0, 80);
}

function cleanChat(value) {
  return String(value || '').trim().replace(/[<>]/g, '').slice(0, 200);
}

function newRound(room) {
  room.roundNumber += 1;
  return {
    id: `${room.roundNumber}-${randomId()}`,
    phase: 'waiting',
    playerIds: [],
    diceByPlayer: new Map(),
    currentBid: null,
    turnIndex: 0,
    openResult: null,
  };
}

function newRoom() {
  const room = {
    code: randomRoomCode(),
    hostId: null,
    players: [],
    messages: [],
    roundNumber: 0,
    round: null,
  };
  room.round = newRound(room);
  rooms.set(room.code, room);
  return room;
}

function findPlayer(room, playerId) {
  return room.players.find((player) => player.id === playerId);
}

function roundPlayers(room) {
  return room.round.playerIds
    .map((playerId) => findPlayer(room, playerId))
    .filter(Boolean);
}

function currentTurnPlayer(room) {
  return room.round.playerIds[room.round.turnIndex] || null;
}

function publicRound(room) {
  const round = room.round;
  const data = {
    id: round.id,
    phase: round.phase,
    diceCount: DICE_PER_PLAYER,
    playerCount: round.playerIds.length,
    rolled: round.phase === 'playing' || round.phase === 'revealed',
    currentBid: round.currentBid,
    turnPlayerId: currentTurnPlayer(room),
    openResult: null,
  };
  if (round.phase === 'revealed') data.openResult = round.openResult;
  return data;
}

function publicRoom(room) {
  const roundPlayerIds = new Set(room.round.playerIds);
  return {
    type: 'room_state',
    roomCode: room.code,
    hostId: room.hostId,
    players: room.players.map((player, seat) => ({
      id: player.id,
      nickname: player.nickname,
      seat,
      online: Boolean(player.online),
      inRound: roundPlayerIds.has(player.id),
      isTurn: currentTurnPlayer(room) === player.id && room.round.phase === 'playing',
    })),
    round: publicRound(room),
    messages: room.messages.slice(-CHAT_LIMIT),
  };
}

function send(ws, payload) {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
}

function broadcast(room) {
  const state = publicRoom(room);
  for (const player of room.players) {
    if (player.ws) send(player.ws, state);
  }
}

function sendPrivateState(room, player) {
  if (!player?.ws) return;
  send(player.ws, {
    type: 'private_state',
    roundId: room.round.id,
    dice: room.round.diceByPlayer.get(player.id) || [],
  });
}

function sendError(ws, message) {
  send(ws, { type: 'error', message });
}

function activePlayers(room) {
  return room.players.filter((player) => player.online);
}

function startGame(room) {
  const players = activePlayers(room);
  if (players.length < 2) return false;
  room.round = newRound(room);
  room.round.phase = 'playing';
  room.round.playerIds = players.map((player) => player.id);
  room.round.turnIndex = 0;
  for (const player of players) {
    room.round.diceByPlayer.set(player.id, rollDice(DICE_PER_PLAYER, () => crypto.randomInt(1, 7)));
  }
  broadcast(room);
  for (const player of players) sendPrivateState(room, player);
  return true;
}

function removeFromRound(room, playerId) {
  const round = room.round;
  const index = round.playerIds.indexOf(playerId);
  if (index === -1) return;
  round.playerIds.splice(index, 1);
  round.diceByPlayer.delete(playerId);
  if (round.playerIds.length < 2 && round.phase === 'playing') {
    round.phase = 'waiting';
    round.currentBid = null;
    round.turnIndex = 0;
    round.playerIds = [];
    round.diceByPlayer.clear();
    return;
  }
  if (round.turnIndex > index) round.turnIndex -= 1;
  if (round.turnIndex >= round.playerIds.length) round.turnIndex = 0;
}

function addChat(room, player, text) {
  const message = cleanChat(text);
  if (!message) return;
  room.messages.push({
    id: randomId(),
    playerId: player.id,
    nickname: player.nickname,
    text: message,
    at: Date.now(),
  });
  room.messages = room.messages.slice(-CHAT_LIMIT);
  broadcast(room);
}

function reveal(room, opener) {
  const round = room.round;
  const players = roundPlayers(room);
  const face = round.currentBid.face;
  const allDice = players.map((player, seat) => ({
    id: player.id,
    nickname: player.nickname,
    seat,
    dice: round.diceByPlayer.get(player.id) || [],
  }));
  const actualCount = allDice.reduce((total, player) => total + countFace(player.dice, face), 0);
  const decision = resolveBid(round.currentBid, actualCount);
  const winnerId = decision.bidIsCorrect ? round.currentBid.playerId : opener.id;
  const winner = findPlayer(room, winnerId);
  round.phase = 'revealed';
  round.openResult = {
    openerId: opener.id,
    openerNickname: opener.nickname,
    bid: round.currentBid,
    actualCount,
    face,
    bidIsCorrect: decision.bidIsCorrect,
    winnerId,
    winnerNickname: winner?.nickname || '',
    allDice,
  };
  broadcast(room);
}

function registerPlayer(ws, room, playerId, nickname) {
  let player = findPlayer(room, playerId);
  if (player?.online) {
    sendError(ws, '这个玩家已经在房间里');
    return null;
  }
  if (!player && room.round.phase === 'playing') {
    sendError(ws, '本局已经开始，请等本局结束再加入');
    return null;
  }
  if (!player && room.players.length >= MAX_PLAYERS) {
    sendError(ws, `房间最多 ${MAX_PLAYERS} 人`);
    return null;
  }
  if (!player) {
    player = { id: playerId, nickname, online: true, ws };
    room.players.push(player);
    if (!room.hostId) room.hostId = playerId;
  } else {
    player.nickname = nickname || player.nickname;
    player.online = true;
    player.ws = ws;
  }
  clients.set(ws, { roomCode: room.code, playerId });
  send(ws, { type: 'joined', playerId, roomCode: room.code });
  broadcast(room);
  if (room.round.phase === 'playing') sendPrivateState(room, player);
  return player;
}

function removeConnection(ws) {
  const context = clients.get(ws);
  if (!context) return;
  clients.delete(ws);
  const room = rooms.get(context.roomCode);
  if (!room) return;
  const player = findPlayer(room, context.playerId);
  if (!player || player.ws !== ws) return;
  player.online = false;
  player.ws = null;
  removeFromRound(room, player.id);
  if (room.hostId === player.id) room.hostId = room.players.find((item) => item.online)?.id || null;
  broadcast(room);
  if (!room.players.some((item) => item.online)) {
    setTimeout(() => {
      if (rooms.get(room.code) === room && !room.players.some((item) => item.online)) rooms.delete(room.code);
    }, 60_000);
  }
}

function handleMessage(ws, message) {
  const context = clients.get(ws);
  if (message.type === 'create_room') {
    if (context) return sendError(ws, '你已经在房间里');
    const playerId = cleanPlayerId(message.playerId);
    if (!playerId) return sendError(ws, '缺少玩家身份');
    registerPlayer(ws, newRoom(), playerId, cleanNickname(message.nickname));
    return;
  }
  if (message.type === 'join_room') {
    if (context) return sendError(ws, '你已经在房间里');
    const room = rooms.get(String(message.roomCode || '').trim().toUpperCase());
    const playerId = cleanPlayerId(message.playerId);
    if (!room) return sendError(ws, '房间不存在或已过期');
    if (!playerId) return sendError(ws, '缺少玩家身份');
    registerPlayer(ws, room, playerId, cleanNickname(message.nickname));
    return;
  }
  if (!context) return sendError(ws, '请先创建或加入房间');
  const room = rooms.get(context.roomCode);
  const player = room && findPlayer(room, context.playerId);
  if (!room || !player) return sendError(ws, '房间状态已失效，请重新加入');

  if (message.type === 'start_game') {
    if (room.hostId !== player.id) return sendError(ws, '只有房主可以开始游戏');
    if (!['waiting', 'revealed'].includes(room.round.phase)) return sendError(ws, '当前不能开始新一局');
    if (!startGame(room)) return sendError(ws, '至少需要两位在线玩家');
    return;
  }

  if (message.type === 'chat') {
    addChat(room, player, message.text);
    return;
  }

  if (message.type === 'bid') {
    const round = room.round;
    const count = Number(message.count);
    const face = Number(message.face);
    const bid = { count, face, playerId: player.id, nickname: player.nickname };
    if (round.phase !== 'playing') return sendError(ws, '当前不在猜点数阶段');
    if (currentTurnPlayer(room) !== player.id) return sendError(ws, '还没轮到你');
    if (!Number.isInteger(count) || count < 1 || count > round.playerIds.length * DICE_PER_PLAYER) return sendError(ws, '数量不合法');
    if (!Number.isInteger(face) || face < 1 || face > 6) return sendError(ws, '点数必须是 1 到 6');
    if (!isHigherBid(round.currentBid, bid)) return sendError(ws, '新的叫法必须比上一手更大');
    round.currentBid = bid;
    round.turnIndex = (round.turnIndex + 1) % round.playerIds.length;
    broadcast(room);
    return;
  }

  if (message.type === 'open') {
    const round = room.round;
    if (round.phase !== 'playing') return sendError(ws, '当前不能开盖');
    if (currentTurnPlayer(room) !== player.id) return sendError(ws, '还没轮到你');
    if (!round.currentBid) return sendError(ws, '还没有人猜点数');
    reveal(room, player);
    return;
  }

  if (message.type === 'leave_room') ws.close();
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  send(ws, { type: 'hello', protocol: 'liars-dice-simple-v1' });
  ws.on('message', (data) => {
    try {
      handleMessage(ws, JSON.parse(data.toString()));
    } catch (err) {
      sendError(ws, '无法解析请求');
    }
  });
  ws.on('close', () => removeConnection(ws));
  ws.on('error', () => removeConnection(ws));
});

server.listen(PORT, () => {
  console.log(`Liar's dice server listening on :${PORT}`);
});

module.exports = { server, rooms };
