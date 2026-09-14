App({
  globalData: {
    socketUrl: 'ws://127.0.0.1:8787/ws',
    playerId: '',
    nickname: '',
  },

  onLaunch() {
    let playerId = wx.getStorageSync('transparentDicePlayerId');
    if (!playerId) {
      playerId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      wx.setStorageSync('transparentDicePlayerId', playerId);
    }
    this.globalData.playerId = playerId;
    this.globalData.nickname = wx.getStorageSync('transparentDiceNickname') || '';
  },
});
