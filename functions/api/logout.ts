import { AppContext, clearCookie, getSessionCookieName, json, requireSession } from "../_lib/auth";

export async function onRequestPost(context: AppContext): Promise<Response> {
  const auth = await requireSession(context);

  if (auth) {
    await context.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(auth.session.id).run();
  }

  const headers = new Headers();
  headers.append("Set-Cookie", clearCookie(getSessionCookieName(context.env)));

  return json({ ok: true }, { status: 200, headers });
}
