# ⚱ OnChain Will — 链上遗嘱

> 死亡之后，你的 Solana 资产去哪里？

**OnChain Will** 是一个运行在 Solana 上的 AI Agent，监控你的链上活动。一旦超过设定的不活跃阈值，它自动将你的资产转移给指定受益人。无需律师，无需信任，代码即遗嘱。

🌐 **Live Demo:** [onchainwill.vercel.app](https://onchainwill.vercel.app)

-----

![Landing](./screenshot-landing.svg)

-----

## 它解决什么问题？

每天都有人因为意外失去生命，但他们钱包里的加密资产就此永远锁死。没有律师能执行它，没有家人知道私钥。

OnChain Will 让 Agent 来做这件事。

-----

## 工作原理

```
用户配置遗嘱
    ↓
签署预签名转账交易（私钥留在钱包，不上链）
    ↓
OnChain Will Agent 开始 24/7 监控
    ↓
每天查询 Solana RPC → 检测最后链上活动时间
    ↓
调用 Bitget Wallet Skill → 实时资产估值
    ↓
超过阈值？
  ├─ 否 → 继续监控，等待下一个周期
  └─ 是 → 安全审计受益人地址
            ↓
           广播预签名交易
            ↓
           资产到达受益人 ✓
```

-----

## 核心功能

**配置遗嘱**

- 设置转移金额（SOL）
- 指定受益人地址
- 选择不活跃阈值（7 / 14 / 30 / 60 / 90 天）
- 签署预签名交易（私钥永不离开你的设备）

**实时监控 Dashboard**

- 环形倒计时，直观显示剩余时间百分比
- 实时 SOL 价格（Bitget Wallet Skill API）
- AI Agent 日志，每个关键节点自然语言状态报告

**触发执行**

- Solana RPC 检测不活跃
- Bitget Wallet Skill 最终资产估值
- 受益人地址安全审计
- 广播预签名交易至主网

**存活心跳**

- 点击”我还活着”随时重置倒计时
- 或在链上发起任意交易即可自动续期（V2 规划）

-----

## 技术架构

|层级      |技术                                       |
|--------|-----------------------------------------|
|前端      |单文件 HTML + Vanilla JS（零依赖）               |
|链上数据    |Solana Mainnet RPC                       |
|市场数据    |Bitget Wallet Skill API（`token-price`）   |
|安全审计    |Bitget Wallet Skill API（`security-audit`）|
|交易广播    |Bitget Wallet Skill API（`swap-send`）     |
|API 签名  |Web Crypto API HMAC-SHA256（浏览器原生）        |
|AI Agent|Anthropic Claude API                     |
|部署      |Vercel / Netlify                         |

### Bitget Wallet Skill 接口映射

```
Skill 命令                          本项目调用
─────────────────────────────────────────────────────
token-price --chain sol          →  资产实时估值
security --chain sol --contract  →  受益人地址风险审计
swap-send <signed_tx>            →  广播预签名转账交易
```

### 签名机制

所有 Bitget Wallet API 请求使用 HMAC-SHA256 签名，完全在浏览器端通过 Web Crypto API 完成，无需后端服务器：

```javascript
// 字段按字母序排列后 JSON stringify → HMAC-SHA256 → Base64
const sorted  = Object.fromEntries(Object.keys(content).sort().map(k => [k, content[k]]));
const payload = JSON.stringify(sorted);
const sig     = await hmacSign(BGW_SECRET, payload);
```

-----

## 本地运行

不需要 npm，不需要 build，直接打开文件：

```bash
git clone https://github.com/YOUR_USERNAME/onchain-will
cd onchain-will
open index.html   # 或直接拖进浏览器
```

无 Phantom 钱包？点”连接钱包”后自动进入 **Demo 模式**，所有功能完整体验。

-----

## 部署

**Netlify Drop（最简单）**

1. 打开 [app.netlify.com/drop](https://app.netlify.com/drop)
1. 上传 `index.html`
1. 完成

**Vercel**

1. Fork 这个 repo
1. 在 [vercel.com](https://vercel.com) 导入
1. Framework: Other → Deploy

-----

## 黑客松赛道

|赛道                    |说明                                           |
|----------------------|---------------------------------------------|
|✅ Agent 与 Agent 经济体系  |Will Agent 可作为服务被其他 Agent 调用（“此地址是否还活跃？”）    |
|✅ 自动赚钱                |保护资产不永久丢失，是最重要的财富管理                          |
|✅ 赛博糊弄学               |帮你跟死亡”谈判”，让资产传承不靠运气                          |
|✅ Bitget Wallet Skills|深度集成 token-price · security-audit · swap-send|

-----

## Screenshots

![Dashboard](./screenshot-dashboard.svg)

![Triggered](./screenshot-triggered.svg)

-----

## V2 路线图

- [ ] 真实 Solana 预签名交易（`@solana/web3.js Transaction.serialize`）
- [ ] 链上活动自动检测重置（无需手动点击”我还活着”）
- [ ] 多受益人 + 按比例分配
- [ ] 支持 SPL Token（USDC、BONK 等）
- [ ] Telegram Bot 存活心跳
- [ ] A2A：暴露 REST API 供其他 Agent 查询地址活跃状态

-----

*代码即遗嘱。Agent 不会忘记你的意愿。*

MIT License
