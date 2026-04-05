import { AppContext, getRemainingCredits, json, requireSession } from "../_lib/auth";

export async function onRequestGet(context: AppContext): Promise<Response> {
  const auth = await requireSession(context);

  if (!auth) {
    return json({
      loggedIn: false,
      quota: {
        limit: 0,
        used: 0,
        remaining: 0,
      },
    });
  }

  const quota = await getRemainingCredits(context, auth.user.id);

  return json({
    loggedIn: true,
    user: {
      id: auth.user.id,
      email: auth.user.email,
      name: auth.user.name,
      picture: auth.user.picture,
    },
    quota,
    subscription: quota.planCode
      ? {
          planCode: quota.planCode,
        }
      : undefined,
  });
}
