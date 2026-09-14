const app = getApp();

const PIPS = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

Page({
  data: {
    screen: 'home',
    nickname: app.globalData.nickname || '',
    roomInput: '',
    roomCode: '',
    hostId: '',
    isHost: false,
    players: [],
    phase: 'waiting',
    phaseTitle: '等人加入',
    phaseHint: '把房间号发给朋友，大家进来后再开始',
    turnPlayerId: '',
    turnName: '',
    isMyTurn: false,
    currentBid: null,
    myDice: [],
    result: null,
    messages: [],
    chatInput: '',
    bidCount: '',
    bidFace: '',
    connected: false,
    connecting: false,
    error: '',
  },

  onLoad() {
    this.socket = null;
    this.currentRoundId = '';
  },

  onUnload() {
    if (this.socket) this.socket.close();
  },

  onNicknameInput(event) {
    this.setData({ nickname: event.detail.value.slice(0, 16) });
  },

  onRoomInput(event) {
    this.setData({ roomInput: event.detail.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) });
  },

  onChatInput(event) {
    this.setData({ chatInput: event.detail.value.slice(0, 200) });
  },

  onBidCountInput(event) {
    this.setData({ bidCount: event.detail.value.replace(/[^0-9]/g, '').slice(0, 2) });
  },

  onBidFaceInput(event) {
    this.setData({ bidFace: event.detail.value.replace(/[^1-6]/g, '').slice(0, 1) });
  },

  rememberNickname() {
    const nickname = this.data.nickname.trim() || '玩家';
    app.globalData.nickname = nickname;
    wx.setStorageSync('transparentDiceNickname', nickname);
    return nickname;
  },

  createRoom() {
    if (this.data.connecting) return;
    this.openSocket({
      type: 'create_room',
      playerId: app.globalData.playerId,
      nickname: this.rememberNickname(),
    });
  },

  joinRoom() {
    if (this.data.connecting) return;
    const roomCode = this.data.roomInput.trim().toUpperCase();
    if (roomCode.length !== 6) {
      this.setData({ error: '请输入 6 位房间号' });
      return;
    }
    this.openSocket({
      type: 'join_room',
      roomCode,
      playerId: app.globalData.playerId,
      nickname: this.rememberNickname(),
    });
  },

  openSocket(firstMessage) {
    this.setData({ connecting: true, error: '' });
    this.socket = wx.connectSocket({ url: app.globalData.socketUrl });
    this.socket.onOpen(() => {
      this.setData({ connecting: false, connected: true });
      this.send(firstMessage);
    });
    this.socket.onMessage((event) => {
      try {
        this.handleMessage(JSON.parse(event.data));
      } catch (err) {
        this.setData({ error: '收到无法识别的房间消息' });
      }
    });
    this.socket.onError(() => {
      this.setData({ connecting: false, connected: false, error: '连接服务端失败，请检查网络或服务端地址' });
    });
    this.socket.onClose(() => {
      this.setData({ connecting: false, connected: false });
      if (this.data.screen === 'room') this.setData({ error: '连接已断开，请重新加入房间' });
    });
  },

  send(message) {
    if (!this.socket || !this.data.connected) return;
    this.socket.send({ data: JSON.stringify(message) });
  },

  handleMessage(message) {
    if (message.type === 'hello' || message.type === 'joined') return;
    if (message.type === 'private_state') {
      this.setData({ myDice: this.decorateDice(message.dice) });
      return;
    }
    if (message.type === 'error') {
      this.setData({ error: message.message || '操作失败' });
      return;
    }
    if (message.type !== 'room_state') return;

    const round = message.round;
    if (this.currentRoundId !== round.id) this.setData({ myDice: [] });
    this.currentRoundId = round.id;
    const players = message.players.map((player) => ({
      ...player,
      isMe: player.id === app.globalData.playerId,
      initial: (player.nickname || '玩').slice(0, 1),
    }));
    const turnPlayer = players.find((player) => player.id === round.turnPlayerId);
    const phaseCopy = {
      waiting: { title: '等人加入', hint: '把房间号发给朋友，大家进来后再开始' },
      playing: { title: turnPlayer ? `${turnPlayer.nickname} 的回合` : '进行中', hint: '可以聊天、叫更大的点数，或者直接开盖' },
      revealed: { title: '开盖了', hint: '所有人的骰子都已经亮出来了' },
    }[round.phase] || { title: '房间进行中', hint: '' };

    this.setData({
      screen: 'room',
      roomCode: message.roomCode,
      hostId: message.hostId,
      isHost: message.hostId === app.globalData.playerId,
      players,
      phase: round.phase,
      phaseTitle: phaseCopy.title,
      phaseHint: phaseCopy.hint,
      turnPlayerId: round.turnPlayerId,
      turnName: turnPlayer ? turnPlayer.nickname : '',
      isMyTurn: round.turnPlayerId === app.globalData.playerId,
      currentBid: round.currentBid,
      result: round.openResult ? this.decorateResult(round.openResult) : null,
      messages: message.messages || [],
      error: '',
    });
  },

  decorateDice(dice) {
    return (dice || []).map((value) => ({ value, pips: PIPS[value] || [] }));
  },

  decorateResult(result) {
    return {
      ...result,
      allDice: (result.allDice || []).map((player) => ({
        ...player,
        initial: (player.nickname || '玩').slice(0, 1),
        dice: this.decorateDice(player.dice),
      })),
    };
  },

  startGame() {
    if (!this.data.isHost) return;
    this.send({ type: 'start_game' });
  },

  submitBid() {
    if (!this.data.currentRoundId || this.data.phase !== 'playing') return;
    const count = Number(this.data.bidCount);
    const face = Number(this.data.bidFace);
    if (!Number.isInteger(count) || count < 1 || !Number.isInteger(face) || face < 1 || face > 6) {
      this.setData({ error: '请输入合法的数量和点数，例如：3 个 5 点' });
      return;
    }
    this.send({ type: 'bid', roundId: this.currentRoundId, count, face });
  },

  openLid() {
    this.send({ type: 'open', roundId: this.currentRoundId });
  },

  sendChat() {
    if (!this.data.chatInput.trim()) return;
    this.send({ type: 'chat', text: this.data.chatInput });
    this.setData({ chatInput: '' });
  },

  playAgain() {
    if (!this.data.isHost) return;
    this.send({ type: 'start_game' });
  },

  copyRoomCode() {
    wx.setClipboardData({
      data: this.data.roomCode,
      success: () => wx.showToast({ title: '房间号已复制', icon: 'none' }),
    });
  },

  leaveRoom() {
    if (this.socket) {
      this.send({ type: 'leave_room' });
      this.socket.close();
      this.socket = null;
    }
    this.currentRoundId = '';
    this.setData({
      screen: 'home',
      roomCode: '',
      players: [],
      myDice: [],
      result: null,
      messages: [],
      connected: false,
      error: '',
    });
  },
});
