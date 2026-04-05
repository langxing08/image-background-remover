import { json, requireSession, type AppContext } from "../../_lib/auth";
import { createPaypalSubscription } from "../../_lib/paypal";
import type { PlanCode } from "../../_lib/subscription";

interface CreateBody {
  planCode?: PlanCode;
}

export async function onRequestPost(context: AppContext): Promise<Response> {
  const auth = await requireSession(context);

  if (!auth) {
    return json({ error: "Unauthorized", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  let body: CreateBody;
  try {
    body = (await context.request.json()) as CreateBody;
  } catch {
    return json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.planCode) {
    return json({ error: "planCode is required." }, { status: 400 });
  }

  try {
    const result = await createPaypalSubscription(context, {
      planCode: body.planCode,
      userId: auth.user.id,
    });

    return json({
      subscriptionId: result.subscriptionId,
      status: result.status,
      approveUrl: result.approveUrl,
      paypalPlanId: result.paypalPlanId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create PayPal subscription.";
    console.error("[paypal/create-subscription]", message);
    return json({ error: message }, { status: 500 });
  }
}
