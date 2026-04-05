import { json, type AppContext } from "../../../_lib/auth";
import { activateSubscriptionOrder } from "../../../_lib/subscription";

interface CallbackBody {
  orderNo?: string;
  transactionId?: string;
  status?: string;
}

export async function onRequestPost(context: AppContext): Promise<Response> {
  const provider = context.params.provider || "unknown";

  let body: CallbackBody;
  try {
    body = (await context.request.json()) as CallbackBody;
  } catch {
    return json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.orderNo) {
    return json({ error: "orderNo is required." }, { status: 400 });
  }

  if (body.status && body.status !== "paid") {
    return json({ ok: true, ignored: true, provider });
  }

  try {
    const result = await activateSubscriptionOrder(context, {
      orderNo: body.orderNo,
      transactionId: body.transactionId || null,
      rawPayload: JSON.stringify({ provider, body }),
    });

    return json({ ok: true, duplicated: result.duplicated, provider });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment callback failed.";
    const status = message === "ORDER_NOT_FOUND" ? 404 : 500;
    return json({ error: message }, { status });
  }
}
