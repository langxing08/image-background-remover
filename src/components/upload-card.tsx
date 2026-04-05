"use client";

import Image from "next/image";
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";

declare global {
  interface Window {
    paypal?: {
      Buttons: (options: {
        style?: Record<string, string | number | boolean>;
        createSubscription: (
          _data: unknown,
          actions: {
            subscription: {
              create: (input: {
                plan_id: string;
                custom_id?: string;
                application_context?: {
                  shipping_preference?: "NO_SHIPPING" | "GET_FROM_FILE" | "SET_PROVIDED_ADDRESS";
                  user_action?: "CONTINUE" | "SUBSCRIBE_NOW";
                  return_url?: string;
                  cancel_url?: string;
                };
              }) => Promise<string>;
            };
          }
        ) => Promise<string>;
        onApprove: (data: { subscriptionID: string }) => Promise<void> | void;
        onCancel?: () => void;
        onError?: (error: unknown) => void;
      }) => {
        render: (selector: string | HTMLElement) => Promise<void>;
      };
    };
  }
}

type RequestState = "idle" | "uploading" | "success" | "error";
type AuthStatus = "loading" | "logged_out" | "logged_in";
type PlanCode = "trial" | "standard" | "premium";

type MeResponse = {
  loggedIn: boolean;
  user?: {
    id: string;
    email: string;
    name?: string | null;
    picture?: string | null;
  };
  quota?: {
    limit: number;
    used: number;
    remaining: number;
  };
  subscription?: {
    planCode: PlanCode;
  };
};

type SubscriptionCenterResponse = {
  user: {
    id: string;
    email: string;
    name?: string | null;
    picture?: string | null;
  };
  currentSubscription: {
    planCode: PlanCode | null;
    status: string;
    startedAt?: string | null;
    expiresAt?: string | null;
    autoRenew: boolean;
  };
  usage: {
    usageMonth: string;
    planCode: PlanCode;
    quotaTotal: number;
    quotaUsed: number;
    quotaRemaining: number;
    resetAt: string;
  } | null;
  plans: {
    planCode: PlanCode;
    planName: string;
    priceMonth: number;
    quotaMonth: number;
    priorityLevel: number;
    isRecommended: boolean;
    isEnabled: boolean;
    sortOrder: number;
    isCurrent: boolean;
  }[];
  orders: {
    orderNo: string;
    planCode: PlanCode;
    amount: number;
    paymentStatus: string;
    createdAt: string;
    paidAt?: string | null;
    effectiveAt?: string | null;
    expiresAt?: string | null;
  }[];
};

type PaypalConfigResponse = {
  clientId: string;
  env: "sandbox" | "live";
};

type PaypalCreateSubscriptionResponse = {
  subscriptionId: string;
  status: string;
  approveUrl: string | null;
  paypalPlanId: string;
  error?: string;
};

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024;
const LOGIN_URL = `/api/auth/google/login?returnTo=${encodeURIComponent("/")}`;

function formatFileSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatPlanName(planCode?: string) {
  switch (planCode) {
    case "trial":
      return "体验版";
    case "standard":
      return "标准版";
    case "premium":
      return "高级版";
    default:
      return "未开通";
  }
}

async function loadPaypalSdk(config: PaypalConfigResponse) {
  const sdkSrc = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(config.clientId)}&components=buttons&vault=true&intent=subscription&currency=USD`;
  const existingScript = document.querySelector<HTMLScriptElement>("script[data-paypal-sdk='true']");

  if (existingScript && existingScript.src !== sdkSrc) {
    existingScript.remove();
    delete window.paypal;
  } else if (window.paypal) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const currentScript = document.querySelector<HTMLScriptElement>("script[data-paypal-sdk='true']");
    if (currentScript) {
      currentScript.addEventListener("load", () => resolve(), { once: true });
      currentScript.addEventListener("error", () => reject(new Error("Failed to load PayPal SDK.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = sdkSrc;
    script.async = true;
    script.dataset.paypalSdk = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load PayPal SDK."));
    document.body.appendChild(script);
  });
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Failed to read the selected image."));
    reader.readAsDataURL(file);
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Failed to render the processed image preview."));
    reader.readAsDataURL(blob);
  });
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-6 w-6">
      <path d="M12 15.5V5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m7.5 9.5 4.5-4.5 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 18.5c0 .83.67 1.5 1.5 1.5h11c.83 0 1.5-.67 1.5-1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-6 w-6">
      <rect x="4" y="5" width="16" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="m8 15 2.5-2.5a1 1 0 0 1 1.4 0L15 15l1.5-1.5a1 1 0 0 1 1.4 0L20 15.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="10" r="1.2" fill="currentColor" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.2-1.5 3.6-5.5 3.6-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3 14.6 2 12 2a10 10 0 1 0 0 20c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.3-.2-2H12Z" />
      <path fill="#34A853" d="M2.9 7.3 6.1 9.6C7 7 9.3 5.2 12 5.2c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3 14.6 2 12 2 8.1 2 4.8 4.2 2.9 7.3Z" />
      <path fill="#FBBC05" d="M12 22c2.5 0 4.7-.8 6.2-2.3l-2.9-2.4c-.8.6-1.9 1.1-3.3 1.1-3.9 0-5.2-2.7-5.5-3.9l-3.1 2.4C5.2 19.9 8.3 22 12 22Z" />
      <path fill="#4285F4" d="M2.9 16.7 6 14.3C5.8 13.8 5.7 13.2 5.7 12.6S5.8 11.4 6 10.9L2.9 8.5A10 10 0 0 0 2 12c0 1.7.3 3.3.9 4.7Z" />
    </svg>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="max-w-[220px] text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-[#9473b2]">
        <ImageIcon />
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-1.5 text-sm leading-6 text-[#9473b2]">{description}</p>
    </div>
  );
}

function AccountBadge({ user }: { user?: MeResponse["user"] }) {
  return (
    <div className="inline-flex max-w-[220px] items-center gap-2 rounded-full border border-[rgba(223,191,255,0.44)] bg-white/90 px-2.5 py-2 text-xs text-[#6e627d] shadow-sm sm:max-w-[240px]">
      {user?.picture ? (
        <Image src={user.picture} alt={user?.name || user?.email || "Google account"} width={24} height={24} className="h-6 w-6 rounded-full" unoptimized />
      ) : (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f0e2ff] text-[11px] font-semibold text-[#865f95]">
          {(user?.name || user?.email || "G").slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="truncate font-medium">{user?.name || user?.email}</span>
    </div>
  );
}

function useSessionState() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<MeResponse["user"]>();
  const [quota, setQuota] = useState<MeResponse["quota"]>({ limit: 0, used: 0, remaining: 0 });
  const [subscription, setSubscription] = useState<MeResponse["subscription"]>();
  const [center, setCenter] = useState<SubscriptionCenterResponse | null>(null);

  const refreshSession = async () => {
    try {
      setAuthStatus("loading");
      const response = await fetch("/api/me", { cache: "no-store" });
      const payload = (await response.json()) as MeResponse;

      if (!payload.loggedIn) {
        setUser(undefined);
        setQuota(payload.quota ?? { limit: 0, used: 0, remaining: 0 });
        setSubscription(undefined);
        setCenter(null);
        setAuthStatus("logged_out");
        return;
      }

      setUser(payload.user);
      setQuota(payload.quota ?? { limit: 100, used: 0, remaining: 100 });
      setSubscription(payload.subscription);
      setAuthStatus("logged_in");

      const centerResponse = await fetch("/api/subscription-center", { cache: "no-store" });
      if (centerResponse.ok) {
        const centerPayload = (await centerResponse.json()) as SubscriptionCenterResponse;
        setCenter(centerPayload);
      }
    } catch {
      setUser(undefined);
      setQuota({ limit: 0, used: 0, remaining: 0 });
      setSubscription(undefined);
      setCenter(null);
      setAuthStatus("logged_out");
    }
  };

  useEffect(() => {
    void refreshSession();
  }, []);

  return { authStatus, setAuthStatus, user, quota, setQuota, subscription, center, refreshSession, setCenter };
}

export function AuthControls() {
  const { authStatus, user, refreshSession } = useSessionState();

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    await refreshSession();
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {authStatus === "logged_in" ? (
        <>
          <AccountBadge user={user} />
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex min-h-10 items-center justify-center rounded-full border border-[rgba(223,191,255,0.44)] bg-white px-4 text-sm font-semibold text-[#865f95] transition hover:bg-[#fbf5ff]"
          >
            Log out
          </button>
        </>
      ) : (
        <a
          href={LOGIN_URL}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#ebb2ff_0%,#c39fff_100%)] px-4 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(184,131,255,0.36)] transition hover:brightness-105"
        >
          <GoogleIcon />
          <span>{authStatus === "loading" ? "Checking login..." : "Sign in with Google"}</span>
        </a>
      )}
    </div>
  );
}

function SubscriptionCenterCard({
  center,
  authStatus,
  onRefresh,
}: {
  center: SubscriptionCenterResponse | null;
  authStatus: AuthStatus;
  onRefresh: () => Promise<void>;
}) {
  const [actionMessage, setActionMessage] = useState("");
  const [paypalConfig, setPaypalConfig] = useState<PaypalConfigResponse | null>(null);
  const [paypalReady, setPaypalReady] = useState(false);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (authStatus !== "logged_in") {
      setPaypalConfig(null);
      setPaypalReady(false);
      return;
    }

    let cancelled = false;

    const setupPaypal = async () => {
      try {
        const configResponse = await fetch("/api/paypal/config", { cache: "no-store" });
        const configPayload = (await configResponse.json().catch(() => null)) as PaypalConfigResponse | { error?: string } | null;
        if (!configResponse.ok || !configPayload || !("clientId" in configPayload)) {
          throw new Error((configPayload as { error?: string } | null)?.error || "Failed to load PayPal config.");
        }

        await loadPaypalSdk(configPayload);

        if (cancelled) return;

        setPaypalConfig(configPayload);
        setPaypalReady(true);
      } catch (error) {
        if (!cancelled) {
          setPaypalReady(false);
          setActionMessage(error instanceof Error ? error.message : "Failed to load PayPal SDK.");
        }
      }
    };

    void setupPaypal();

    return () => {
      cancelled = true;
    };
  }, [authStatus]);

  useEffect(() => {
    if (!paypalReady || !window.paypal || !center?.plans?.length) {
      return;
    }

    const paypal = window.paypal;
    let cancelled = false;

    const renderButtons = async () => {
      for (const plan of center.plans) {
        const container = document.getElementById(`paypal-button-${plan.planCode}`);
        if (!container) {
          continue;
        }

        container.innerHTML = "";
        if (plan.isCurrent) {
          continue;
        }

        await paypal.Buttons({
          style: {
            shape: "pill",
            color: "gold",
            label: "subscribe",
            height: 42,
          },
          createSubscription: async (_data, _actions) => {
            setActionMessage("正在创建订阅，请稍候…");
            const resp = await fetch("/api/paypal/create-subscription", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ planCode: plan.planCode }),
            });
            const payload = (await resp.json().catch(() => null)) as PaypalCreateSubscriptionResponse | null;
            if (!resp.ok || !payload?.subscriptionId) {
              const msg = payload?.error ?? `Server error ${resp.status}`;
              setActionMessage(`创建订阅失败：${msg}`);
              throw new Error(msg);
            }
            setActionMessage("PayPal 窗口已打开，请在弹窗中完成订阅。");
            return payload.subscriptionId;
          },
          onApprove: async (data) => {
            const activateResponse = await fetch("/api/paypal/activate-subscription", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                planCode: plan.planCode,
                subscriptionId: data.subscriptionID,
              }),
            });

            const activatePayload = (await activateResponse.json().catch(() => null)) as { error?: string; orderNo?: string } | null;
            if (!activateResponse.ok) {
              throw new Error(activatePayload?.error || "Failed to activate subscription.");
            }

            setActionMessage(`PayPal 订阅已开通：${activatePayload?.orderNo ?? data.subscriptionID}`);
            await onRefreshRef.current();
          },
          onCancel: () => {
            setActionMessage(`已取消 ${plan.planName} 的 PayPal 订阅。`);
          },
          onError: (error) => {
            console.error("[PayPal onError]", error);
            const msg =
              error instanceof Error
                ? error.message
                : typeof error === "string"
                  ? error
                  : JSON.stringify(error);
            setActionMessage(`PayPal 错误：${msg}`);
          },
        }).render(container);

        if (cancelled) {
          break;
        }
      }
    };

    void renderButtons().catch((error) => {
      if (!cancelled) {
        setActionMessage(error instanceof Error ? error.message : "Failed to render PayPal button.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [center, paypalReady]);

  if (authStatus !== "logged_in") {
    return (
      <section className="mt-6 overflow-hidden rounded-[28px] border border-[rgba(223,191,255,0.52)] bg-white/80 shadow-[0_20px_70px_rgba(196,147,255,0.18)]">
        <div className="px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Subscription</h2>
          <p className="mt-1 text-sm text-slate-600">登录后可查看套餐、月额度和订单记录。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-6 overflow-hidden rounded-[28px] border border-[rgba(223,191,255,0.52)] bg-white/80 shadow-[0_20px_70px_rgba(196,147,255,0.18)]">
      <div className="border-b border-[rgba(223,191,255,0.4)] px-5 py-4">
        <h2 className="text-base font-semibold text-slate-900">个人中心</h2>
        <p className="mt-1 text-sm text-slate-600">当前套餐、月额度、切换订阅、支付记录。</p>
        {paypalConfig ? <p className="mt-2 text-xs text-[#865f95]">PayPal 环境：{paypalConfig.env}</p> : null}
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-3xl border border-[rgba(223,191,255,0.44)] bg-[linear-gradient(180deg,#fff_0%,#fff8fe_100%)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#a67cc0]">当前套餐</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{center?.currentSubscription.status === "active" ? formatPlanName(center?.currentSubscription.planCode || undefined) : "未开通"}</p>
                <p className="mt-1 text-sm text-slate-600">状态：{center?.currentSubscription.status === "active" ? "生效中" : "未订阅"}</p>
              </div>
              <div className="rounded-2xl bg-[#faf3ff] px-3 py-2 text-right text-xs text-[#865f95]">
                <div>开始：{formatDateTime(center?.currentSubscription.startedAt)}</div>
                <div className="mt-1">到期：{formatDateTime(center?.currentSubscription.expiresAt)}</div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-[rgba(223,191,255,0.44)] bg-[linear-gradient(180deg,#fff_0%,#f7fbff_100%)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#a67cc0]">本月使用情况</p>
                <p className="mt-2 text-sm text-slate-600">已用 {center?.usage?.quotaUsed ?? 0} / {center?.usage?.quotaTotal ?? 0}</p>
              </div>
              <div className="text-right text-xs text-[#865f95]">剩余 {center?.usage?.quotaRemaining ?? 0}</div>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#f0e6f8]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#c39fff_0%,#ebb2ff_100%)]"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((((center?.usage?.quotaUsed ?? 0) / Math.max(center?.usage?.quotaTotal ?? 1, 1)) * 100) || 0)
                  )}%`,
                }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">重置时间：{formatDateTime(center?.usage?.resetAt)}</p>
          </div>
        </div>

        <div className="rounded-3xl border border-[rgba(223,191,255,0.44)] bg-[linear-gradient(180deg,#fff_0%,#fffafd_100%)] p-4">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#a67cc0]">套餐切换</p>
          <div className="mt-3 space-y-3">
            {center?.plans.map((plan) => (
              <div key={plan.planCode} className={`rounded-2xl border p-4 ${plan.isCurrent ? "border-[#c39fff] bg-[#fcf7ff]" : "border-slate-200 bg-white"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-base font-semibold text-slate-900">{plan.planName}</p>
                      {plan.isRecommended ? <span className="rounded-full bg-[#f2e4ff] px-2 py-0.5 text-[10px] font-semibold text-[#865f95]">推荐</span> : null}
                      {plan.isCurrent ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">当前</span> : null}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">${plan.priceMonth} / month · {plan.quotaMonth} credits</p>
                  </div>
                  <div className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold ${
                    plan.isCurrent ? "bg-slate-100 text-slate-400" : "bg-[#fff6d8] text-[#8a6a00]"
                  }`}>
                    {plan.isCurrent ? "当前套餐" : paypalReady ? "PayPal Sandbox" : "加载 PayPal..."}
                  </div>
                </div>
                <div id={`paypal-button-${plan.planCode}`} className="mt-3 min-h-[42px]" />
              </div>
            ))}
          </div>
          {actionMessage ? <p className="mt-3 text-xs text-[#865f95]">{actionMessage}</p> : null}
        </div>
      </div>

      <div className="border-t border-[rgba(223,191,255,0.4)] px-4 py-4">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#a67cc0]">支付记录</p>
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-[1.4fr_.9fr_.8fr_1fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
            <div>订单号</div>
            <div>套餐</div>
            <div>金额</div>
            <div>状态</div>
          </div>
          {(center?.orders?.length ?? 0) > 0 ? (
            center?.orders.map((order) => (
              <div key={order.orderNo} className="grid grid-cols-[1.4fr_.9fr_.8fr_1fr] gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-700">
                <div className="truncate" title={order.orderNo}>{order.orderNo}</div>
                <div>{formatPlanName(order.planCode)}</div>
                <div>${order.amount}</div>
                <div>{order.paymentStatus}</div>
              </div>
            ))
          ) : (
            <div className="px-4 py-6 text-sm text-slate-500">暂无订单记录</div>
          )}
        </div>
      </div>
    </section>
  );
}

export function UploadCard() {
  const [dragActive, setDragActive] = useState(false);
  const [state, setState] = useState<RequestState>("idle");
  const [error, setError] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string>("");
  const [resultUrl, setResultUrl] = useState<string>("");
  const { authStatus, setAuthStatus, quota, setQuota, subscription, center, refreshSession } = useSessionState();

  const isBusy = state === "uploading";
  const canUpload = authStatus === "logged_in" && (quota?.remaining ?? 0) > 0 && !isBusy;

  const helperText = useMemo(() => {
    if (authStatus === "loading") return "Checking your login status...";
    if (authStatus === "logged_out") return "Sign in with Google to unlock subscription quota.";
    if ((quota?.remaining ?? 0) <= 0) {
      return subscription?.planCode ? `本月额度已用完，请升级套餐或等待下月重置。` : `免费次数已用完，今天请明天再来，或直接购买套餐。`;
    }
    if (isBusy) return "Removing background...";
    if (state === "success") return `Done. Your transparent PNG is ready. ${quota?.remaining ?? 0} removals left this month.`;
    if (state === "error") return error;
    return subscription?.planCode
      ? `当前套餐 ${formatPlanName(subscription?.planCode)}，本月剩余 ${quota?.remaining ?? 0}/${quota?.limit ?? 0} 次。`
      : `当前未订阅，今日免费剩余 ${quota?.remaining ?? 0}/${quota?.limit ?? 0} 次。`;
  }, [authStatus, error, isBusy, quota, state, subscription]);

  const validateFile = (nextFile: File) => {
    if (!ACCEPTED_TYPES.includes(nextFile.type)) {
      throw new Error("Unsupported file type. Please upload JPG, PNG, or WEBP.");
    }

    if (nextFile.size > MAX_SIZE) {
      throw new Error(`File is too large. Please upload an image smaller than ${formatFileSize(MAX_SIZE)}.`);
    }
  };

  const handleSelectedFile = async (nextFile: File) => {
    try {
      if (authStatus !== "logged_in") {
        throw new Error("Please sign in with Google before uploading an image.");
      }

      if ((quota?.remaining ?? 0) <= 0) {
        throw new Error("Your current monthly quota has already been used.");
      }

      validateFile(nextFile);
      setState("idle");
      setError("");
      setFile(nextFile);
      setResultUrl("");

      const nextOriginalUrl = await fileToDataUrl(nextFile);
      setOriginalUrl(nextOriginalUrl);

      const formData = new FormData();
      formData.append("image_file", nextFile);

      setState("uploading");
      const response = await fetch("/api/remove-background", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
        if (payload?.code === "AUTH_REQUIRED") {
          setAuthStatus("logged_out");
        }
        throw new Error(payload?.error || "Failed to remove background. Please try again later.");
      }

      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) {
        throw new Error("Server returned a non-image response.");
      }

      const nextResultUrl = await blobToDataUrl(blob);
      setResultUrl(nextResultUrl);

      const nextLimit = Number(response.headers.get("X-Quota-Limit") || quota?.limit || 0);
      const nextUsed = Number(response.headers.get("X-Quota-Used") || quota?.used || 0);
      const nextRemaining = Number(response.headers.get("X-Quota-Remaining") || quota?.remaining || 0);
      setQuota({ limit: nextLimit, used: nextUsed, remaining: nextRemaining });
      setState("success");
      await refreshSession();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setState("error");
      setError(message);
    }
  };

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;
    await handleSelectedFile(nextFile);
    event.target.value = "";
  };

  const onDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragActive(false);
    const nextFile = event.dataTransfer.files?.[0];
    if (!nextFile) return;
    await handleSelectedFile(nextFile);
  };

  useEffect(() => {
    if (authStatus === "logged_out") {
      setState("idle");
      setError("");
      setResultUrl("");
      setFile(null);
      setOriginalUrl("");
    }
  }, [authStatus]);

  return (
    <>
      <section className="overflow-hidden rounded-[28px] border border-[rgba(223,191,255,0.52)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94)_0%,rgba(255,244,253,1)_100%)] shadow-[0_28px_82px_rgba(196,147,255,0.32)]">
        <div className="border-b border-[rgba(223,191,255,0.40)] px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.025em] text-[#623f77] sm:text-[17px]">
              Upload image
            </h2>
            <p className="mt-1 text-xs leading-5 text-[#9473b2] sm:text-[13px]">
              Sign in with Google, use your monthly quota, then export a transparent PNG.
            </p>
          </div>
        </div>

        <div className="grid gap-3 p-3 sm:gap-4 sm:p-4 lg:grid-cols-[320px_minmax(0,1fr)_minmax(0,1fr)] lg:p-5 xl:grid-cols-[340px_minmax(0,1fr)_minmax(0,1fr)]">
          <label
            htmlFor="image-upload-input"
            onDragOver={(event) => {
              event.preventDefault();
              if (canUpload) setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            className={`flex min-h-[360px] flex-col rounded-[24px] border-2 px-5 py-6 text-center transition lg:min-h-[420px] ${
              dragActive
                ? "border-[rgba(255,151,197,0.76)] bg-[linear-gradient(180deg,rgba(255,255,255,1)_0%,rgba(255,219,237,1)_100%)] shadow-[0_24px_56px_rgba(255,160,200,0.40)]"
                : "border-[rgba(183,216,255,0.28)] bg-[linear-gradient(180deg,rgba(255,255,255,0.74)_0%,rgba(245,249,255,0.84)_100%)]"
            } ${canUpload ? "cursor-pointer hover:border-[rgba(255,144,194,0.82)] hover:bg-[rgba(255,228,242,1)]" : "cursor-not-allowed opacity-95"}`}
          >
            <div className="flex flex-1 flex-col items-center justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-[#9473b2]">
                <UploadIcon />
              </div>

              <p className="mt-4 text-[22px] font-semibold tracking-[-0.035em] text-[#623f77] sm:text-[24px]">
                {isBusy ? "Processing image..." : authStatus === "logged_out" ? "Sign in to upload" : "Choose an image"}
              </p>
              <p className="mt-2 max-w-[240px] text-sm leading-6 text-[#6e627d]">
                {authStatus === "logged_out"
                  ? "Google login is required. Signed-in users can use monthly subscription quota."
                  : "Drag and drop here, or click to upload your image."}
              </p>

              {authStatus === "logged_out" ? (
                <a
                  href={LOGIN_URL}
                  className="mt-5 inline-flex min-h-11 min-w-[176px] items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#ebb2ff_0%,#c39fff_100%)] px-5 text-sm font-semibold text-white shadow-[0_20px_34px_rgba(184,131,255,0.46)] transition hover:brightness-105"
                >
                  <GoogleIcon />
                  Sign in with Google
                </a>
              ) : (
                <>
                  <span className="mt-5 rounded-full bg-[#f8efff] px-3 py-1.5 text-xs font-semibold text-[#865f95]">
                    {(subscription?.planCode ? formatPlanName(subscription?.planCode) : "未开通") + ` · ${quota?.remaining ?? 0}/${quota?.limit ?? 0} left`}
                  </span>
                  <span
                    aria-disabled={!canUpload}
                    className={`mt-3 inline-flex min-h-11 min-w-[176px] items-center justify-center rounded-full px-5 text-sm font-semibold shadow-[0_20px_34px_rgba(184,131,255,0.46)] transition ${
                      canUpload
                        ? "cursor-pointer bg-[linear-gradient(135deg,#ebb2ff_0%,#c39fff_100%)] text-white hover:brightness-105"
                        : "cursor-not-allowed bg-slate-300 text-[#6e627d] shadow-none"
                    }`}
                  >
                    {isBusy ? "Processing..." : (quota?.remaining ?? 0) > 0 ? "Upload image" : "Quota used up"}
                  </span>
                </>
              )}

              {resultUrl ? (
                <a
                  href={resultUrl}
                  download="removed-background.png"
                  className="mt-3 inline-flex cursor-pointer items-center justify-center rounded-full border border-[rgba(255,154,194,0.74)] bg-[linear-gradient(180deg,rgba(255,232,243,1)_0%,rgba(255,214,231,1)_100%)] px-4 py-2 text-sm font-semibold text-[#db4e91] transition hover:brightness-105"
                >
                  Download PNG
                </a>
              ) : null}

              <input
                id="image-upload-input"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={onFileChange}
                disabled={!canUpload}
              />
            </div>

            <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-[#9473b2]">
              <span className="rounded-full border border-[rgba(223,191,255,0.44)] bg-[rgba(255,255,255,0.98)] px-3 py-1.5">JPG / PNG / WEBP · Up to 10MB</span>
              <span className="rounded-full border border-[rgba(223,191,255,0.44)] bg-[rgba(255,255,255,0.98)] px-3 py-1.5">Google sign-in required</span>
              <span className="rounded-full border border-[rgba(223,191,255,0.44)] bg-[rgba(255,255,255,0.98)] px-3 py-1.5">Monthly subscription quota</span>
            </div>
          </label>

          <div className="rounded-[24px] border border-[rgba(183,216,255,0.28)] bg-[linear-gradient(180deg,rgba(255,255,255,0.74)_0%,rgba(245,249,255,0.84)_100%)] p-3">
            <div className="mb-2 px-1 text-[10px] font-medium tracking-[0.01em] text-[#b79fce]">Original image</div>
            <div className="checkerboard flex min-h-[360px] items-center justify-center overflow-hidden rounded-[20px] border border-[rgba(198,179,243,0.28)] bg-[rgba(255,255,255,0.84)] p-3 lg:min-h-[420px]">
              {originalUrl ? (
                <Image
                  src={originalUrl}
                  alt="Original upload preview"
                  width={1600}
                  height={1200}
                  unoptimized
                  className="block max-h-full max-w-full object-contain"
                />
              ) : (
                <EmptyState title="Original preview" description="Your uploaded image will appear here." />
              )}
            </div>
            {file ? (
              <div className="mt-2 truncate px-1 text-xs text-[#9473b2]" title={file.name}>
                {file.name}
              </div>
            ) : null}
          </div>

          <div className="rounded-[24px] border border-[rgba(183,216,255,0.28)] bg-[linear-gradient(180deg,rgba(255,255,255,0.74)_0%,rgba(245,249,255,0.84)_100%)] p-3">
            <div className="mb-2 px-1 text-[10px] font-medium tracking-[0.01em] text-[#b79fce]">Transparent PNG</div>
            <div className="checkerboard flex min-h-[360px] items-center justify-center overflow-hidden rounded-[20px] border border-[rgba(198,179,243,0.28)] bg-[rgba(255,255,255,0.84)] p-3 lg:min-h-[420px]">
              {resultUrl ? (
                <Image
                  src={resultUrl}
                  alt="Background removed result preview"
                  width={1600}
                  height={1200}
                  unoptimized
                  className="block max-h-full max-w-full object-contain"
                />
              ) : state === "error" ? (
                <div className="max-w-[260px] rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-center text-sm leading-6 text-rose-700">
                  {error || "Processing failed. Please try another image."}
                </div>
              ) : (
                <EmptyState title="Transparent PNG" description="The processed result will appear here." />
              )}
            </div>
          </div>
        </div>

        <div
          className={`border-t px-4 py-3 text-sm sm:px-5 ${
            state === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : state === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-[rgba(194,178,232,0.22)] bg-slate-50 text-[#6e627d]"
          }`}
        >
          {helperText}
        </div>
      </section>

      <SubscriptionCenterCard center={center} authStatus={authStatus} onRefresh={refreshSession} />
    </>
  );
}
