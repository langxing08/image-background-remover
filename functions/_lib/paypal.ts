import type { AppContext } from "./auth";
import type { PlanCode } from "./subscription";
import { getPlanByCode } from "./subscription";

const PAYPAL_API_BASE = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
};

function getPaypalMode(context: AppContext) {
  return context.env.PAYPAL_ENV === "live" ? "live" : "sandbox";
}

function getPaypalApiBase(context: AppContext) {
  return PAYPAL_API_BASE[getPaypalMode(context)];
}

function assertPaypalConfigured(context: AppContext) {
  if (!context.env.PAYPAL_CLIENT_ID || !context.env.PAYPAL_CLIENT_SECRET) {
    throw new Error("PAYPAL_NOT_CONFIGURED");
  }
}

async function paypalRequest<T>(
  context: AppContext,
  accessToken: string,
  path: string,
  init?: RequestInit & { requestId?: string }
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Content-Type", "application/json");
  if (init?.requestId) {
    headers.set("PayPal-Request-Id", init.requestId);
  }

  const response = await fetch(`${getPaypalApiBase(context)}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PAYPAL_API_ERROR:${path}:${response.status}:${text}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function getPaypalAccessToken(context: AppContext): Promise<string> {
  assertPaypalConfigured(context);

  const credentials = btoa(`${context.env.PAYPAL_CLIENT_ID}:${context.env.PAYPAL_CLIENT_SECRET}`);
  const response = await fetch(`${getPaypalApiBase(context)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PAYPAL_TOKEN_ERROR:${text}`);
  }

  const payload = (await response.json()) as { access_token: string };
  return payload.access_token;
}

export async function getPaypalConfig(context: AppContext) {
  assertPaypalConfigured(context);
  return {
    clientId: context.env.PAYPAL_CLIENT_ID,
    env: getPaypalMode(context),
  };
}

async function createPaypalProduct(context: AppContext, accessToken: string, planCode: PlanCode) {
  const payload = await paypalRequest<{ id: string }>(context, accessToken, "/v1/catalogs/products", {
    method: "POST",
    requestId: `paypal-product-${planCode}-${crypto.randomUUID()}`,
    body: JSON.stringify({
      name: `Image Background Remover ${planCode}`,
      description: `Monthly subscription for ${planCode}`,
      type: "SERVICE",
      category: "SOFTWARE",
    }),
  });
  return payload.id;
}

async function fetchPaypalProduct(context: AppContext, accessToken: string, productId: string) {
  return paypalRequest<{ id: string; status?: string }>(context, accessToken, `/v1/catalogs/products/${productId}`, {
    method: "GET",
  });
}

async function createPaypalPlan(
  context: AppContext,
  accessToken: string,
  input: { productId: string; planCode: PlanCode; planName: string; amount: number }
) {
  const payload = await paypalRequest<{ id: string; status?: string }>(context, accessToken, "/v1/billing/plans", {
    method: "POST",
    requestId: `paypal-plan-${input.planCode}-${crypto.randomUUID()}`,
    body: JSON.stringify({
      product_id: input.productId,
      name: `${input.planName} Monthly`,
      description: `${input.planName} monthly subscription`,
      status: "ACTIVE",
      billing_cycles: [
        {
          frequency: {
            interval_unit: "MONTH",
            interval_count: 1,
          },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: {
              value: input.amount.toFixed(2),
              currency_code: "USD",
            },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: "CONTINUE",
        payment_failure_threshold: 3,
      },
    }),
  });
  return payload.id;
}

async function fetchPaypalPlan(context: AppContext, accessToken: string, planId: string) {
  return paypalRequest<{ id: string; status?: string; product_id?: string }>(context, accessToken, `/v1/billing/plans/${planId}`, {
    method: "GET",
  });
}

async function activatePaypalPlan(context: AppContext, accessToken: string, planId: string) {
  await paypalRequest<void>(context, accessToken, `/v1/billing/plans/${planId}/activate`, {
    method: "POST",
    body: "{}",
  });
}

async function ensurePaypalPlanIsActive(context: AppContext, accessToken: string, planId: string) {
  const plan = await fetchPaypalPlan(context, accessToken, planId);
  if (plan.status === "ACTIVE") {
    return plan;
  }

  await activatePaypalPlan(context, accessToken, planId);
  return await fetchPaypalPlan(context, accessToken, planId);
}

export async function ensurePaypalPlan(context: AppContext, planCode: PlanCode) {
  const existing = await context.env.DB.prepare(
    `SELECT paypal_product_id as paypalProductId, paypal_plan_id as paypalPlanId, plan_name as planName, price_month as priceMonth
     FROM plan_configs
     WHERE plan_code = ?
     LIMIT 1`
  )
    .bind(planCode)
    .first<{
      paypalProductId: string | null;
      paypalPlanId: string | null;
      planName: string;
      priceMonth: number;
    }>();

  if (!existing) {
    throw new Error("PLAN_NOT_AVAILABLE");
  }

  const accessToken = await getPaypalAccessToken(context);

  if (existing.paypalPlanId) {
    try {
      const activePlan = await ensurePaypalPlanIsActive(context, accessToken, existing.paypalPlanId);
      return {
        paypalProductId: activePlan.product_id ?? existing.paypalProductId,
        paypalPlanId: activePlan.id,
      };
    } catch {
      await context.env.DB.prepare(
        `UPDATE plan_configs
         SET paypal_product_id = NULL, paypal_plan_id = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE plan_code = ?`
      )
        .bind(planCode)
        .run();
    }
  }

  const plan = await getPlanByCode(context, planCode);
  if (!plan) {
    throw new Error("PLAN_NOT_AVAILABLE");
  }

  let productId = existing.paypalProductId;
  if (productId) {
    try {
      const product = await fetchPaypalProduct(context, accessToken, productId);
      productId = product.id;
    } catch {
      productId = null;
    }
  }

  if (!productId) {
    productId = await createPaypalProduct(context, accessToken, planCode);
  }

  const planId = await createPaypalPlan(context, accessToken, {
    productId,
    planCode,
    planName: plan.planName,
    amount: plan.priceMonth,
  });
  await ensurePaypalPlanIsActive(context, accessToken, planId);

  await context.env.DB.prepare(
    `UPDATE plan_configs
     SET paypal_product_id = ?, paypal_plan_id = ?, updated_at = CURRENT_TIMESTAMP
     WHERE plan_code = ?`
  )
    .bind(productId, planId, planCode)
    .run();

  return {
    paypalProductId: productId,
    paypalPlanId: planId,
  };
}

export async function createPaypalSubscription(
  context: AppContext,
  input: { planCode: PlanCode; userId: string }
) {
  const planData = await ensurePaypalPlan(context, input.planCode);
  const accessToken = await getPaypalAccessToken(context);
  const baseUrl = context.env.APP_BASE_URL || "https://image.happylove.space";

  const response = await fetch(`${getPaypalApiBase(context)}/v1/billing/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `sub-${input.userId}-${input.planCode}-${Date.now()}`,
    },
    body: JSON.stringify({
      plan_id: planData.paypalPlanId,
      custom_id: input.userId,
      application_context: {
        shipping_preference: "NO_SHIPPING",
        user_action: "SUBSCRIBE_NOW",
        return_url: `${baseUrl}/?paypal_return=1&planCode=${input.planCode}`,
        cancel_url: `${baseUrl}/?paypal_cancel=1`,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PAYPAL_CREATE_SUBSCRIPTION_ERROR:${response.status}:${text}`);
  }

  const data = (await response.json()) as {
    id: string;
    status: string;
    links?: { href: string; rel: string; method: string }[];
  };

  return {
    subscriptionId: data.id,
    status: data.status,
    approveUrl: data.links?.find((l) => l.rel === "approve")?.href ?? null,
    paypalPlanId: planData.paypalPlanId,
  };
}

export async function fetchPaypalSubscription(context: AppContext, subscriptionId: string) {
  const accessToken = await getPaypalAccessToken(context);
  const response = await fetch(`${getPaypalApiBase(context)}/v1/billing/subscriptions/${subscriptionId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PAYPAL_FETCH_SUBSCRIPTION_ERROR:${text}`);
  }

  return response.json() as Promise<{
    id: string;
    status: string;
    plan_id?: string;
    custom_id?: string;
    subscriber?: {
      email_address?: string;
    };
  }>;
}
