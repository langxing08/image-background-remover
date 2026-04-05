# Image Background Remover

单页图片抠图站，部署在 Cloudflare Pages。

当前版本已接入：

- Google OAuth 登录
- 服务端 session（cookie 只存 session id）
- D1 用户 / session / 订阅 / 月额度统计
- 三档订阅：9.9 / 19.9 / 39.9
- 已登录用户按套餐月额度抠图
- 未登录用户无可用额度

域名：<https://image.happylove.space>

---

## 技术栈

- Next.js 15（静态导出）
- Cloudflare Pages Functions
- Google OAuth 2.0 / OpenID Connect
- Cloudflare D1
- remove.bg API

---

## 本地 / 服务器开发

```bash
npm run build
```

前端走静态导出，API 走 `functions/` 下的 Cloudflare Pages Functions。

---

## 需要配置的环境变量

参考 `.env.example`：

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `APP_BASE_URL`
- `FREE_DAILY_CREDITS`
- `REMOVE_BG_API_KEY`
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_ENV`（sandbox / live）
- `PAYPAL_WEBHOOK_ID`（可选但建议；用于校验 PayPal webhook 签名）

其中生产环境建议：

```bash
APP_BASE_URL=https://image.happylove.space
GOOGLE_REDIRECT_URI=https://image.happylove.space/api/auth/google/callback
FREE_DAILY_CREDITS=3
```

说明：
- `FREE_DAILY_CREDITS` 目前仅作为兜底兼容值保留
- 正式额度优先走 `plan_configs` + `user_usage_monthly`

---

## D1 数据库初始化

先创建 D1：

```bash
npx wrangler d1 create image-background-remover
```

把返回的 `database_id` 填到 `wrangler.toml` 的 `[[d1_databases]]`。

然后执行建表：

```bash
npx wrangler d1 execute image-background-remover --remote --file=./schema.sql
```

---

## Google OAuth 配置

在 Google Cloud Console 创建 Web application 类型的 OAuth Client。

### Authorized JavaScript origins

```text
https://image.happylove.space
```

### Authorized redirect URIs

```text
https://image.happylove.space/api/auth/google/callback
```

---

## 主要接口

- `GET /api/auth/google/login`
- `GET /api/auth/google/callback`
- `GET /api/me`
- `POST /api/logout`
- `POST /api/remove-background`
- `GET /api/subscription-center`
- `POST /api/subscriptions/create-order`
- `GET /api/paypal/config`
- `POST /api/paypal/activate-subscription`
- `POST /api/payments/callback/:provider`

---

## 数据表

### users
Google 用户资料

### sessions
登录 session

### daily_usage
按用户、按天记录免费次数

---

## 当前业务规则

- 未登录：不可抠图
- 已登录：按当前套餐月额度可用
- 当前三档：`trial=100`、`standard=300`、`premium=800`
- 每次成功调用 remove.bg 后才扣 1 次
- 月额度按 Asia/Shanghai 自然月切分
- 支付回调成功后立即切换到新套餐，并重算当月额度上限

---

## 后续可以继续做

- 付费套餐
- Stripe / 微信支付
- 历史记录
- 原图 / 结果图存储
- 管理后台
- 邀请码 / 营销活动
