# 同屏骰局：异地吹牛骰子微信小程序

这是一个简单的 2–8 人联机骰子房间：大家加入同一个房间后，房主开始一局，每个人会拿到 5 个只在自己屏幕上显示的骰子；轮到谁就可以聊天、叫“几个几”，或者直接点“开盖”。一旦有人开盖，服务端会把所有人的骰子一次性发给所有人。

这个流程对应常见的吹牛骰子（Liar’s Dice）：骰子先隐藏，玩家轮流提高对全桌骰子的猜测，也可以挑战上一手；挑战后所有骰子一起揭示。参考：[Liar’s Dice 基本规则](https://liarsdice.co/rules/) 和 [Wikipedia 规则概览](https://en.wikipedia.org/wiki/Liar%27s_dice)。

## 已实现

- 创建/加入 6 位房间号
- 2–8 人房间
- 房主开始游戏，每人自动获得 5 个隐藏骰子
- 轮流叫点数，新的叫法必须比上一手大
- 轮到当前玩家时可以直接“开盖”
- 开盖后所有玩家自动看到所有骰子
- 自动统计实际点数，并提示上一手猜对还是猜错
- 房间内实时聊天
- 房主可以开始下一局
- 内存房间和 60 条聊天记录，服务端重启后房间会消失

## 目录

```text
wechat-dice/
├── miniprogram/                 # 微信开发者工具导入的前端
│   ├── pages/index/             # 房间、骰子、猜点数、聊天、开盖
│   └── app.js                   # WebSocket 地址配置
├── server/                      # Node.js WebSocket 服务端
│   ├── src/server.js
│   ├── src/rules.js
│   └── test/rules.test.js
└── project.config.json
```

## 本地运行

```bash
cd wechat-dice/server
npm install
npm test
npm start
```

默认服务端地址：`ws://127.0.0.1:8787/ws`。

## Docker 部署

服务器已经安装 Docker 时，可以直接在项目根目录执行：

```bash
cd /opt/wechat-dice
docker compose up -d --build
docker compose ps
docker compose logs -f wechat-dice
```

容器只把服务绑定到服务器本机的 `127.0.0.1:8787`，适合让 Nginx 在外层提供 HTTPS/WSS。检查服务：

```bash
curl http://127.0.0.1:8787/health
```

更新代码：

```bash
cd /opt/wechat-dice
git pull --ff-only origin main
docker compose up -d --build
```

然后用微信开发者工具导入 `wechat-dice` 目录。开发阶段 `project.config.json` 已关闭域名校验：

- 开发者工具模拟器一般可以直接连 `127.0.0.1`。
- 真机调试时，把 `miniprogram/app.js` 的地址改成电脑局域网 IP，例如 `ws://192.168.1.10:8787/ws`。
- 如果要让异地朋友直接测试，需要把服务端部署到公网，并使用 `wss://你的域名/ws`；同时在微信公众平台配置合法域名。仅把小程序代码发给朋友，不能让两台手机跨网络直接通信。

## 关于安卓 App

当前先保留微信小程序，因为它更适合快速邀请朋友扫码测试，也不需要先安装 APK。只有在你不想处理微信小程序的合法域名、审核或登录限制时，再把同一个 WebSocket 服务端接成安卓前端即可，服务端协议不需要重写。
