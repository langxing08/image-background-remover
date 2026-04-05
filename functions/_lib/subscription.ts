import { getRemainingCredits, type AppContext, type Env } from "./auth";

export type PlanCode = "trial" | "standard" | "premium";
export type SubscriptionStatus = "inactive" | "active" | "expired" | "canceled";
export type PaymentStatus = "pending" | "paid" | "failed" | "closed" | "refunded";

export interface PlanConfig {
  planCode: PlanCode;
  planName: string;
  priceMonth: number;
  quotaMonth: number;
  priorityLevel: number;
  isRecommended: boolean;
  isEnabled: boolean;
  sortOrder: number;
}

export interface MonthlyQuota {
  quotaTotal: number;
  quotaUsed: number;
  quotaRemaining: number;
}

const DEFAULT_FREE_PLAN_CODE: PlanCode = "trial";

export function getCurrentMonthKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
  }).format(date);
}

export function getNextMonthStartIso(date = new Date()): string {
  const shanghai = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

  const [year, month] = shanghai.split("-").map(Number);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const monthStr = String(nextMonth).padStart(2, "0");
  return `${nextYear}-${monthStr}-01T00:00:00+08:00`;
}

export function addOneMonthIso(date = new Date()): string {
  const next = new Date(date);
  next.setMonth(next.getMonth() + 1);
  return next.toISOString();
}

export function generateOrderNo(date = new Date()): string {
  const p = (n: number, len = 2) => String(n).padStart(len, "0");
  const r = p(Math.floor(Math.random() * 10000), 4);
  return `SUB${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}${r}`;
}

export async function getEnabledPlans(context: AppContext): Promise<PlanConfig[]> {
  const rows = await context.env.DB.prepare(
    `SELECT
        plan_code as planCode,
        plan_name as planName,
        price_month as priceMonth,
        quota_month as quotaMonth,
        priority_level as priorityLevel,
        is_recommended as isRecommended,
        is_enabled as isEnabled,
        sort_order as sortOrder
     FROM plan_configs
     WHERE is_enabled = 1
     ORDER BY sort_order ASC, price_month ASC`
  ).all<PlanConfig>();

  return rows.results ?? [];
}

export async function getPlanByCode(context: AppContext, planCode: PlanCode): Promise<PlanConfig | null> {
  const row = await context.env.DB.prepare(
    `SELECT
        plan_code as planCode,
        plan_name as planName,
        price_month as priceMonth,
        quota_month as quotaMonth,
        priority_level as priorityLevel,
        is_recommended as isRecommended,
        is_enabled as isEnabled,
        sort_order as sortOrder
     FROM plan_configs
     WHERE plan_code = ?
     LIMIT 1`
  )
    .bind(planCode)
    .first<PlanConfig>();

  return row ?? null;
}

export function getFreePlanCode(_env?: Env): PlanCode {
  void _env;
  return DEFAULT_FREE_PLAN_CODE;
}

export async function ensureMonthlyQuotaRecord(
  context: AppContext,
  userId: string,
  planCode: PlanCode,
  quotaTotal: number,
  usageMonth = getCurrentMonthKey()
): Promise<void> {
  const existing = await context.env.DB.prepare(
    `SELECT user_id as userId
     FROM user_usage_monthly
     WHERE user_id = ? AND usage_month = ?
     LIMIT 1`
  )
    .bind(userId, usageMonth)
    .first<{ userId: string }>();

  if (existing) return;

  await context.env.DB.prepare(
    `INSERT INTO user_usage_monthly (
      user_id, usage_month, plan_code, quota_total, quota_used, quota_remaining, reset_at
    ) VALUES (?, ?, ?, ?, 0, ?, ?)`
  )
    .bind(userId, usageMonth, planCode, quotaTotal, quotaTotal, getNextMonthStartIso())
    .run();
}

export async function getMonthlyQuota(context: AppContext, userId: string, usageMonth = getCurrentMonthKey()): Promise<MonthlyQuota | null> {
  const row = await context.env.DB.prepare(
    `SELECT
      quota_total as quotaTotal,
      quota_used as quotaUsed,
      quota_remaining as quotaRemaining
     FROM user_usage_monthly
     WHERE user_id = ? AND usage_month = ?
     LIMIT 1`
  )
    .bind(userId, usageMonth)
    .first<MonthlyQuota>();

  return row ?? null;
}

export async function listOrders(context: AppContext, userId: string, limit = 10) {
  const rows = await context.env.DB.prepare(
    `SELECT
      order_no as orderNo,
      plan_code as planCode,
      amount,
      payment_status as paymentStatus,
      created_at as createdAt,
      paid_at as paidAt,
      effective_at as effectiveAt,
      expires_at as expiresAt
     FROM subscription_orders
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ?`
  )
    .bind(userId, limit)
    .all<{
      orderNo: string;
      planCode: string;
      amount: number;
      paymentStatus: string;
      createdAt: string;
      paidAt: string | null;
      effectiveAt: string | null;
      expiresAt: string | null;
    }>();

  return rows.results ?? [];
}

export async function createSubscriptionOrder(
  context: AppContext,
  userId: string,
  planCode: PlanCode,
  paymentProvider: string
) {
  const plan = await getPlanByCode(context, planCode);
  if (!plan || !plan.isEnabled) {
    throw new Error("PLAN_NOT_AVAILABLE");
  }

  const orderNo = generateOrderNo();
  await context.env.DB.prepare(
    `INSERT INTO subscription_orders (
      id, order_no, user_id, plan_code, amount, currency, period_type, period_count, payment_provider, payment_status
    ) VALUES (?, ?, ?, ?, ?, 'USD', 'month', 1, ?, 'pending')`
  )
    .bind(crypto.randomUUID(), orderNo, userId, planCode, plan.priceMonth, paymentProvider)
    .run();

  return {
    orderNo,
    amount: plan.priceMonth,
    paymentStatus: "pending" as PaymentStatus,
    plan,
  };
}

export async function activateSubscriptionOrder(
  context: AppContext,
  input: {
    orderNo: string;
    transactionId?: string | null;
    externalSubscriptionId?: string | null;
    rawPayload?: string | null;
  }
) {
  const order = await context.env.DB.prepare(
    `SELECT
      id,
      order_no as orderNo,
      user_id as userId,
      plan_code as planCode,
      payment_status as paymentStatus
     FROM subscription_orders
     WHERE order_no = ?
     LIMIT 1`
  )
    .bind(input.orderNo)
    .first<{
      id: string;
      orderNo: string;
      userId: string;
      planCode: PlanCode;
      paymentStatus: PaymentStatus;
    }>();

  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (order.paymentStatus === "paid") return { duplicated: true };

  const plan = await getPlanByCode(context, order.planCode);
  if (!plan || !plan.isEnabled) throw new Error("PLAN_NOT_AVAILABLE");

  const nowIso = new Date().toISOString();
  const expiresAt = addOneMonthIso();
  const usageMonth = getCurrentMonthKey();

  await context.env.DB.batch([
    context.env.DB.prepare(
      `UPDATE subscription_orders
       SET payment_status = 'paid',
           payment_transaction_id = ?,
           external_subscription_id = ?,
           raw_callback_payload = ?,
           paid_at = ?,
           effective_at = ?,
           expires_at = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE order_no = ?`
    ).bind(input.transactionId ?? null, input.externalSubscriptionId ?? null, input.rawPayload ?? null, nowIso, nowIso, expiresAt, order.orderNo),
    context.env.DB.prepare(
      `UPDATE users
       SET current_plan_code = ?,
           subscription_status = 'active',
           plan_started_at = ?,
           plan_expires_at = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(order.planCode, nowIso, expiresAt, order.userId),
    context.env.DB.prepare(
      `INSERT INTO user_usage_monthly (
        user_id, usage_month, plan_code, quota_total, quota_used, quota_remaining, reset_at
      ) VALUES (?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(user_id, usage_month) DO UPDATE SET
        plan_code = excluded.plan_code,
        quota_total = excluded.quota_total,
        quota_remaining = CASE
          WHEN user_usage_monthly.quota_used >= excluded.quota_total THEN 0
          ELSE excluded.quota_total - user_usage_monthly.quota_used
        END,
        reset_at = excluded.reset_at,
        updated_at = CURRENT_TIMESTAMP`
    ).bind(order.userId, usageMonth, order.planCode, plan.quotaMonth, plan.quotaMonth, getNextMonthStartIso()),
  ]);

  return { duplicated: false, plan };
}

export async function getSubscriptionCenter(context: AppContext, userId: string) {
  const user = await context.env.DB.prepare(
    `SELECT
      id,
      email,
      name,
      picture,
      current_plan_code as currentPlanCode,
      subscription_status as subscriptionStatus,
      plan_started_at as planStartedAt,
      plan_expires_at as planExpiresAt,
      auto_renew as autoRenew
     FROM users
     WHERE id = ?
     LIMIT 1`
  )
    .bind(userId)
    .first<{
      id: string;
      email: string;
      name: string | null;
      picture: string | null;
      currentPlanCode: PlanCode;
      subscriptionStatus: SubscriptionStatus;
      planStartedAt: string | null;
      planExpiresAt: string | null;
      autoRenew: number;
    }>();

  if (!user) throw new Error("USER_NOT_FOUND");

  const plans = await getEnabledPlans(context);
  const quota = await getRemainingCredits(context, userId);
  const usageMonth = getCurrentMonthKey();
  const usage = user.subscriptionStatus === "active"
    ? await context.env.DB.prepare(
        `SELECT
          usage_month as usageMonth,
          plan_code as planCode,
          quota_total as quotaTotal,
          quota_used as quotaUsed,
          quota_remaining as quotaRemaining,
          reset_at as resetAt
         FROM user_usage_monthly
         WHERE user_id = ? AND usage_month = ?
         LIMIT 1`
      )
        .bind(userId, usageMonth)
        .first<{
          usageMonth: string;
          planCode: PlanCode;
          quotaTotal: number;
          quotaUsed: number;
          quotaRemaining: number;
          resetAt: string;
        }>()
    : null;

  const orders = await listOrders(context, userId, 10);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
    },
    currentSubscription: {
      planCode: user.subscriptionStatus === "active" ? user.currentPlanCode : null,
      status: user.subscriptionStatus,
      startedAt: user.planStartedAt,
      expiresAt: user.planExpiresAt,
      autoRenew: Boolean(user.autoRenew),
    },
    usage: user.subscriptionStatus === "active"
      ? usage
        ? {
            usageMonth: usage.usageMonth,
            planCode: usage.planCode,
            quotaTotal: usage.quotaTotal,
            quotaUsed: usage.quotaUsed,
            quotaRemaining: usage.quotaRemaining,
            resetAt: usage.resetAt,
            mode: "subscription",
          }
        : {
            usageMonth,
            planCode: user.currentPlanCode,
            quotaTotal: quota.limit,
            quotaUsed: quota.used,
            quotaRemaining: quota.remaining,
            resetAt: null,
            mode: "subscription",
          }
      : {
          usageMonth,
          planCode: null,
          quotaTotal: quota.limit,
          quotaUsed: quota.used,
          quotaRemaining: quota.remaining,
          resetAt: null,
          mode: "free",
        },
    plans: plans.map((plan) => ({
      ...plan,
      isCurrent: user.subscriptionStatus === "active" && plan.planCode === user.currentPlanCode,
    })),
    orders,
  };
}

export async function consumeSubscriptionQuota(
  context: AppContext,
  input: {
    userId: string;
    actionType: string;
    consumeAmount?: number;
    requestId?: string | null;
    remark?: string | null;
  }
) {
  const amount = input.consumeAmount ?? 1;
  const usageMonth = getCurrentMonthKey();

  const duplicated = input.requestId
    ? await context.env.DB.prepare(
        `SELECT id FROM usage_logs WHERE request_id = ? LIMIT 1`
      )
        .bind(input.requestId)
        .first<{ id: string }>()
    : null;

  if (duplicated) {
    return getMonthlyQuota(context, input.userId, usageMonth);
  }

  const usage = await getMonthlyQuota(context, input.userId, usageMonth);
  if (!usage || usage.quotaRemaining < amount) {
    throw new Error("QUOTA_NOT_ENOUGH");
  }

  const result = await context.env.DB.prepare(
    `UPDATE user_usage_monthly
     SET quota_used = quota_used + ?,
         quota_remaining = quota_remaining - ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND usage_month = ? AND quota_remaining >= ?`
  )
    .bind(amount, amount, input.userId, usageMonth, amount)
    .run();

  if (!result.success || (result.meta?.changes ?? 0) === 0) {
    throw new Error("QUOTA_NOT_ENOUGH");
  }

  await context.env.DB.prepare(
    `INSERT INTO usage_logs (
      id, user_id, usage_month, action_type, consume_amount, request_id, remark
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), input.userId, usageMonth, input.actionType, amount, input.requestId ?? null, input.remark ?? null)
    .run();

  return getMonthlyQuota(context, input.userId, usageMonth);
}
