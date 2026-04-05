import { json, requireSession, type AppContext } from "../../_lib/auth";
import { getPaypalAccessToken, getPaypalConfig } from "../../_lib/paypal";
import { getEnabledPlans } from "../../_lib/subscription";

export async function onRequestGet(context: AppContext): Promise<Response> {
  const auth = await requireSession(context);

  if (!auth) {
    return json({ error: "Unauthorized", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  try {
    const config = await getPaypalConfig(context);
    results.config = config;
  } catch (e) {
    results.configError = String(e);
  }

  let accessToken: string | null = null;
  try {
    accessToken = await getPaypalAccessToken(context);
    results.tokenOk = true;
  } catch (e) {
    results.tokenError = String(e);
  }

  if (accessToken) {
    const mode = context.env.PAYPAL_ENV === "live" ? "live" : "sandbox";
    const apiBase = mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

    try {
      const plans = await getEnabledPlans(context);
      const planDetails = await Promise.all(
        plans.map(async (plan) => {
          const row = await context.env.DB.prepare(
            `SELECT paypal_product_id, paypal_plan_id FROM plan_configs WHERE plan_code = ? LIMIT 1`
          )
            .bind(plan.planCode)
            .first<{ paypal_product_id: string | null; paypal_plan_id: string | null }>();

          const detail: Record<string, unknown> = {
            planCode: plan.planCode,
            planName: plan.planName,
            priceMonth: plan.priceMonth,
            paypalProductId: row?.paypal_product_id ?? null,
            paypalPlanId: row?.paypal_plan_id ?? null,
          };

          if (row?.paypal_plan_id) {
            try {
              const r = await fetch(`${apiBase}/v1/billing/plans/${row.paypal_plan_id}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
              });
              const body = await r.json();
              detail.paypalPlanStatus = (body as { status?: string }).status ?? "unknown";
              detail.paypalPlanRaw = body;
            } catch (e) {
              detail.paypalPlanFetchError = String(e);
            }
          }

          return detail;
        })
      );
      results.plans = planDetails;
    } catch (e) {
      results.plansError = String(e);
    }
  }

  return json(results);
}
