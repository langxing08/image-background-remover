import { json, requireSession, type AppContext } from "../_lib/auth";
import { getSubscriptionCenter } from "../_lib/subscription";

export async function onRequestGet(context: AppContext): Promise<Response> {
  const auth = await requireSession(context);

  if (!auth) {
    return json({ error: "Unauthorized", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const data = await getSubscriptionCenter(context, auth.user.id);
  return json(data);
}
