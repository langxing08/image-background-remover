import { json, type AppContext } from "../../_lib/auth";
import { fetchPaypalSubscription, verifyPaypalWebhookSignature } from "../../_lib/paypal";
import { activateSubscriptionOrder, createSubscriptionOrder, type PlanCode } from "../../_lib/subscription";

interface PaypalWebhookEvent {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    plan_id?: string;
    custom_id?: string;
  };
}

const ACTIVATION_EVENTS = new Set([
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.CREATED",
  "PAYMENT.SALE.COMPLETED",
]);

export async function onRequestGet(context: AppContext): Promise<Response> {
  return json({
    ok: true,
    endpoint: `${context.env.APP_BASE_URL || new URL(context.request.url).origin}/api/paypal/webhook`,
    env: context.env.PAYPAL_ENV || "sandbox",
    webhookConfigured: Boolean(context.env.PAYPAL_WEBHOOK_ID),
  });
}

export async function onRequestPost(context: AppContext): Promise<Response> {
  let body: PaypalWebhookEvent;
  try {
    body = (await context.request.json()) as PaypalWebhookEvent;
  } catch {
    return json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const verification = await verifyPaypalWebhookSignature(context, {
    body,
    headers: context.request.headers,
  }).catch((error) => ({
    ok: false,
    skipped: false,
    reason: error instanceof Error ? error.message : String(error),
  }));

  if (!verification.skipped && !verification.ok) {
    return json({ error: "Invalid PayPal webhook signature.", verification }, { status: 400 });
  }

  if (!body.event_type || !body.resource?.id) {
    return json({ ok: true, ignored: true, reason: "Missing event_type or resource.id" });
  }

  if (!ACTIVATION_EVENTS.has(body.event_type)) {
    return json({ ok: true, ignored: true, eventType: body.event_type, verification });
  }

  try {
    const subscription = await fetchPaypalSubscription(context, body.resource.id);
    const userId = subscription.custom_id;
    const subscriptionId = subscription.id;
    const paypalPlanId = subscription.plan_id;

    if (!userId || !subscriptionId || !paypalPlanId) {
      return json({ ok: true, ignored: true, reason: "Missing userId/subscriptionId/planId in PayPal subscription", verification });
    }

    const matchedPlan = await context.env.DB.prepare(
      `SELECT plan_code as planCode FROM plan_configs WHERE paypal_plan_id = ? LIMIT 1`
    )
      .bind(paypalPlanId)
      .first<{ planCode: PlanCode }>();

    if (!matchedPlan?.planCode) {
      return json({ ok: true, ignored: true, reason: "No local plan matched PayPal plan id", paypalPlanId, verification });
    }

    const existingOrder = await context.env.DB.prepare(
      `SELECT order_no as orderNo FROM subscription_orders WHERE external_subscription_id = ? LIMIT 1`
    )
      .bind(subscriptionId)
      .first<{ orderNo: string }>();

    const orderNo = existingOrder?.orderNo ?? (await createSubscriptionOrder(context, userId, matchedPlan.planCode, "paypal")).orderNo;

    const result = await activateSubscriptionOrder(context, {
      orderNo,
      transactionId: subscriptionId,
      externalSubscriptionId: subscriptionId,
      rawPayload: JSON.stringify(body),
    });

    return json({
      ok: true,
      eventType: body.event_type,
      orderNo,
      duplicated: result.duplicated,
      verification,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message, verification }, { status: 500 });
  }
}
