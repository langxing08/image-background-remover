import { json, requireSession, type AppContext } from "../../_lib/auth";
import { ensurePaypalPlan, fetchPaypalSubscription } from "../../_lib/paypal";
import { activateSubscriptionOrder, createSubscriptionOrder, type PlanCode } from "../../_lib/subscription";

interface ActivateBody {
  orderNo?: string;
  subscriptionId?: string;
  planCode?: PlanCode;
}

const PAYPAL_ACCEPTED_STATUS = new Set(["ACTIVE"]);

export async function onRequestPost(context: AppContext): Promise<Response> {
  const auth = await requireSession(context);

  if (!auth) {
    return json({ error: "Unauthorized", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  let body: ActivateBody;
  try {
    body = (await context.request.json()) as ActivateBody;
  } catch {
    return json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.subscriptionId || (!body.orderNo && !body.planCode)) {
    return json({ error: "subscriptionId and orderNo or planCode are required." }, { status: 400 });
  }

  try {
    const paypalSubscription = await fetchPaypalSubscription(context, body.subscriptionId);
    if (!PAYPAL_ACCEPTED_STATUS.has(paypalSubscription.status)) {
      return json({ error: `Unexpected PayPal subscription status: ${paypalSubscription.status}` }, { status: 400 });
    }

    let orderNo = body.orderNo;
    if (!orderNo) {
      if (!body.planCode) {
        return json({ error: "planCode is required when orderNo is missing." }, { status: 400 });
      }

      if (!paypalSubscription.plan_id) {
        return json({ error: "PayPal subscription is missing plan_id." }, { status: 400 });
      }

      const expectedPlan = await ensurePaypalPlan(context, body.planCode);
      if (paypalSubscription.plan_id !== expectedPlan.paypalPlanId) {
        return json({ error: "PayPal subscription plan_id does not match the selected plan." }, { status: 400 });
      }

      const existingOrder = await context.env.DB.prepare(
        `SELECT order_no as orderNo
         FROM subscription_orders
         WHERE user_id = ? AND external_subscription_id = ?
         LIMIT 1`
      )
        .bind(auth.user.id, body.subscriptionId)
        .first<{ orderNo: string }>();

      if (existingOrder?.orderNo) {
        orderNo = existingOrder.orderNo;
      } else {
        const planCodeOrder = await createSubscriptionOrder(context, auth.user.id, body.planCode, "paypal");
        orderNo = planCodeOrder.orderNo;
      }
    }

    const result = await activateSubscriptionOrder(context, {
      orderNo,
      transactionId: body.subscriptionId,
      externalSubscriptionId: body.subscriptionId,
      rawPayload: JSON.stringify(paypalSubscription),
    });

    return json({
      ok: true,
      duplicated: result.duplicated,
      orderNo,
      subscriptionStatus: paypalSubscription.status,
      subscriptionId: body.subscriptionId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to activate PayPal subscription.";
    const status = message === "ORDER_NOT_FOUND" ? 404 : 500;
    return json({ error: message }, { status });
  }
}
