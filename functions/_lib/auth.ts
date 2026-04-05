import type { D1Database } from "@cloudflare/workers-types";
import { ensureMonthlyQuotaRecord, getCurrentMonthKey, getMonthlyQuota, getPlanByCode } from "./subscription";

export interface Env {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  APP_BASE_URL?: string;
  REMOVE_BG_API_KEY: string;
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  PAYPAL_ENV?: string;
  PAYPAL_WEBHOOK_ID?: string;
  SESSION_COOKIE_NAME?: string;
  SESSION_MAX_AGE_SECONDS?: string;
  FREE_DAILY_CREDITS?: string;
  DB: D1Database;
}

export interface AppContext {
  request: Request;
  env: Env;
  params: Record<string, string>;
}

export interface SessionUser {
  id: string;
  googleSub: string;
  email: string;
  name: string | null;
  picture: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  expiresAt: string;
}

const DEFAULT_SESSION_COOKIE_NAME = "session_id";
const DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const DEFAULT_FREE_DAILY_CREDITS = 3;
const OAUTH_STATE_COOKIE = "oauth_state";

function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex === -1) return acc;
      const key = decodeURIComponent(part.slice(0, separatorIndex).trim());
      const value = decodeURIComponent(part.slice(separatorIndex + 1).trim());
      acc[key] = value;
      return acc;
    }, {});
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }

  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
}

export function getSessionCookieName(env: Env): string {
  return env.SESSION_COOKIE_NAME || DEFAULT_SESSION_COOKIE_NAME;
}

export function getSessionMaxAgeSeconds(env: Env): number {
  const parsed = Number.parseInt(env.SESSION_MAX_AGE_SECONDS || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SESSION_MAX_AGE_SECONDS;
}

export function getFreeDailyCredits(env: Env): number {
  const parsed = Number.parseInt(env.FREE_DAILY_CREDITS || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FREE_DAILY_CREDITS;
}

export function buildCookie(name: string, value: string, maxAge: number): string {
  const parts = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];

  return parts.join("; ");
}

export function clearCookie(name: string): string {
  return buildCookie(name, "", 0);
}

export function getCookie(request: Request, name: string): string | null {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  return cookies[name] || null;
}

export function getBaseUrl(request: Request, env: Env): string {
  return env.APP_BASE_URL || new URL(request.url).origin;
}

export function getTodayDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function createOAuthState(): Promise<string> {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function requireSession(context: AppContext): Promise<{
  session: SessionRecord;
  user: SessionUser;
} | null> {
  const sessionId = getCookie(context.request, getSessionCookieName(context.env));
  if (!sessionId) return null;

  const sessionRow = await context.env.DB.prepare(
    `SELECT s.id as sessionId, s.user_id as userId, s.expires_at as expiresAt,
            u.id as userIdValue, u.google_sub as googleSub, u.email, u.name, u.picture, u.created_at as createdAt, u.updated_at as updatedAt
     FROM sessions s
     INNER JOIN users u ON u.id = s.user_id
     WHERE s.id = ?`
  )
    .bind(sessionId)
    .first<{
      sessionId: string;
      userId: string;
      expiresAt: string;
      userIdValue: string;
      googleSub: string;
      email: string;
      name: string | null;
      picture: string | null;
      createdAt: string;
      updatedAt: string;
    }>();

  if (!sessionRow) return null;

  if (new Date(sessionRow.expiresAt).getTime() <= Date.now()) {
    await context.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
    return null;
  }

  return {
    session: {
      id: sessionRow.sessionId,
      userId: sessionRow.userId,
      expiresAt: sessionRow.expiresAt,
    },
    user: {
      id: sessionRow.userIdValue,
      googleSub: sessionRow.googleSub,
      email: sessionRow.email,
      name: sessionRow.name,
      picture: sessionRow.picture,
      createdAt: sessionRow.createdAt,
      updatedAt: sessionRow.updatedAt,
    },
  };
}

export async function getUsageCountForToday(context: AppContext, userId: string): Promise<number> {
  const row = await context.env.DB.prepare(
    "SELECT usage_count as usageCount FROM daily_usage WHERE user_id = ? AND usage_date = ?"
  )
    .bind(userId, getTodayDateString())
    .first<{ usageCount: number }>();

  return row?.usageCount ?? 0;
}

export async function getTotalFreeUsageCount(context: AppContext, userId: string): Promise<number> {
  const row = await context.env.DB.prepare(
    "SELECT COALESCE(SUM(usage_count), 0) as usageCount FROM daily_usage WHERE user_id = ?"
  )
    .bind(userId)
    .first<{ usageCount: number }>();

  return row?.usageCount ?? 0;
}

export async function incrementUsageForToday(context: AppContext, userId: string): Promise<number> {
  const usageDate = getTodayDateString();
  const current = await getUsageCountForToday(context, userId);

  if (current > 0) {
    await context.env.DB.prepare(
      `UPDATE daily_usage
       SET usage_count = usage_count + 1, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND usage_date = ?`
    )
      .bind(userId, usageDate)
      .run();
  } else {
    await context.env.DB.prepare(
      `INSERT INTO daily_usage (user_id, usage_date, usage_count)
       VALUES (?, ?, 1)`
    )
      .bind(userId, usageDate)
      .run();
  }

  return getTotalFreeUsageCount(context, userId);
}

export async function getRemainingCredits(context: AppContext, userId: string): Promise<{ used: number; remaining: number; limit: number; planCode?: string }> {
  const user = await context.env.DB.prepare(
    `SELECT current_plan_code as currentPlanCode, subscription_status as subscriptionStatus, plan_expires_at as planExpiresAt
     FROM users
     WHERE id = ?
     LIMIT 1`
  )
    .bind(userId)
    .first<{
      currentPlanCode: string | null;
      subscriptionStatus: string | null;
      planExpiresAt: string | null;
    }>();

  const isActive =
    user?.subscriptionStatus === "active" &&
    user?.currentPlanCode &&
    (!user.planExpiresAt || new Date(user.planExpiresAt).getTime() > Date.now());

  if (isActive) {
    const plan = await getPlanByCode(context, user.currentPlanCode as "trial" | "standard" | "premium");
    if (!plan) {
      return {
        used: 0,
        remaining: 0,
        limit: 0,
        planCode: undefined,
      };
    }

    const usageMonth = getCurrentMonthKey();
    await ensureMonthlyQuotaRecord(context, userId, plan.planCode, plan.quotaMonth, usageMonth);
    const usage = await getMonthlyQuota(context, userId, usageMonth);

    return {
      used: usage?.quotaUsed ?? 0,
      remaining: usage?.quotaRemaining ?? plan.quotaMonth,
      limit: usage?.quotaTotal ?? plan.quotaMonth,
      planCode: plan.planCode,
    };
  }

  const limit = getFreeDailyCredits(context.env);
  const used = await getTotalFreeUsageCount(context, userId);
  return {
    used,
    remaining: Math.max(limit - used, 0),
    limit,
    planCode: undefined,
  };
}

export function getOAuthStateCookieName(): string {
  return OAUTH_STATE_COOKIE;
}
