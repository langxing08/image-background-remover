import { json, type AppContext } from "../../_lib/auth";
import { getPaypalConfig } from "../../_lib/paypal";

export async function onRequestGet(context: AppContext): Promise<Response> {
  try {
    const config = await getPaypalConfig(context);
    return json(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load PayPal config.";
    const status = message === "PAYPAL_NOT_CONFIGURED" ? 500 : 500;
    return json({ error: message }, { status });
  }
}
