# PayPal 沙箱接入与上线步骤

当前代码已经完成：
- 订阅数据结构
- PayPal SDK 前端订阅入口
- PayPal 计划自动创建
- PayPal 订阅激活后自动开通套餐

但当前机器上的 Wrangler **未登录**，所以还不能直接远程执行 D1 / 部署。

## 1. 先登录 Cloudflare

```bash
cd /root/project/image-background-remover
npx wrangler login
```

## 2. 执行 D1 增量迁移

```bash
cd /root/project/image-background-remover
npx wrangler d1 execute image-background-remover --remote --file=./schema.migration.subscription-paypal.sql
```

如果是全新库，也可以直接跑完整 schema：

```bash
npx wrangler d1 execute image-background-remover --remote --file=./schema.sql
```

## 3. 配置 Pages Secrets

```bash
cd /root/project/image-background-remover
npx wrangler pages secret put GOOGLE_CLIENT_ID
npx wrangler pages secret put GOOGLE_CLIENT_SECRET
npx wrangler pages secret put REMOVE_BG_API_KEY
npx wrangler pages secret put PAYPAL_CLIENT_ID
npx wrangler pages secret put PAYPAL_CLIENT_SECRET
```

`PAYPAL_ENV` 已经放到 `wrangler.toml`：

```toml
PAYPAL_ENV = "sandbox"
```

## 4. 确认 Google OAuth 回调

Google Cloud Console 中需要确保：

### Authorized JavaScript origins

```text
https://image.happylove.space
```

### Authorized redirect URIs

```text
https://image.happylove.space/api/auth/google/callback
```

## 5. 部署

```bash
cd /root/project/image-background-remover
npm run build
npx wrangler pages deploy out
```

## 6. PayPal 沙箱测试路径

1. 用 Google 登录站点
2. 在个人中心点击某个套餐的 `PayPal 订阅`
3. 页面加载 PayPal Sandbox 按钮
4. 用 PayPal Sandbox buyer 账号完成订阅
5. 订阅成功后：
   - `subscription_orders.payment_status = paid`
   - `users.current_plan_code` 切为对应套餐
   - `user_usage_monthly` 更新当月额度
6. 刷新页面，确认当前套餐和月额度已变化

## 7. 当前已知注意点

### 币种
代码里 PayPal 计划创建当前使用：
- `USD`

而页面展示仍是：
- `¥9.9 / ¥19.9 / ¥39.9`

如果你要真实上线，建议统一：
- 要么页面改成 `$`
- 要么把 PayPal 计划金额改成人民币（前提是 PayPal 账户支持 `CNY`，通常不推荐）

### PayPal Plan 是自动创建的
首次点击某套餐订阅时，服务端会自动在 PayPal 创建：
- Product
- Billing Plan

然后把 `paypal_product_id` / `paypal_plan_id` 写回 `plan_configs`

### 沙箱凭证泄露处理
当前聊天里已经出现过 sandbox `client secret`。
虽然是沙箱，但建议你测试完成后去 PayPal 开发者后台把这套 sandbox app 凭证更换掉。
