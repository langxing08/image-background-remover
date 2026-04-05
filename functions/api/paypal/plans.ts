import { json, requireSession, type AppContext } from "../../_lib/auth";
import { ensurePaypalPlan } from "../../_lib/paypal";
import { getEnabledPlans, type PlanCode } from "../../_lib/subscription";

export async function onRequestGet(context: AppContext): Promise<Response> {
  const auth = await requireSession(context);

  if (!auth) {
    return json({ error: "Unauthorized", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  try {
    const plans = await getEnabledPlans(context);
    const planMappings = await Promise.all(
      plans.map(async (plan) => {
        const paypal = await ensurePaypalPlan(context, plan.planCode as PlanCode);
        return {
          planCode: plan.planCode,
          paypalPlanId: paypal.paypalPlanId,
        };
      })
    );

    return json({ plans: planMappings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load PayPal plans.";
    return json({ error: message }, { status: 500 });
  }
}
