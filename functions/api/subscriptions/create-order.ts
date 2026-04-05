import { json, requireSession, type AppContext } from "../../_lib/auth";
import { ensurePaypalPlan } from "../../_lib/paypal";
import { createSubscriptionOrder, type PlanCode } from "../../_lib/subscription";

interface CreateOrderBody {
  planCode?: PlanCode;
  paymentProvider?: string;
}

const ALLOWED_PLANS = new Set<PlanCode>(["trial", "standard", "premium"]);

export async function onRequestPost(context: AppContext): Promise<Response> {
  const auth = await requireSession(context);

  if (!auth) {
    return json({ error: "Unauthorized", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  let body: CreateOrderBody;
  try {
    body = (await context.request.json()) as CreateOrderBody;
  } catch {
    return json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const planCode = body.planCode;
  const paymentProvider = body.paymentProvider || "manual";

  if (!planCode || !ALLOWED_PLANS.has(planCode)) {
    return json({ error: "Invalid planCode." }, { status: 400 });
  }

  try {
    const order = await createSubscriptionOrder(context, auth.user.id, planCode, paymentProvider);
    const paypal = paymentProvider === "paypal" ? await ensurePaypalPlan(context, planCode) : null;

    return json({
      orderNo: order.orderNo,
      amount: order.amount,
      paymentStatus: order.paymentStatus,
      plan: order.plan,
      paypalPlanId: paypal?.paypalPlanId ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create order.";
    const status = message === "PLAN_NOT_AVAILABLE" ? 400 : 500;
    return json({ error: message }, { status });
  }
}
