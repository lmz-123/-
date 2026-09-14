App({
  globalData: {
    socketUrl: 'wss://maizi.fun/ws',
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
