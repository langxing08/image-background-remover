import { AppContext, buildCookie, createOAuthState, getOAuthStateCookieName, json } from "../../../_lib/auth";

export async function onRequestGet(context: AppContext): Promise<Response> {
  if (!context.env.GOOGLE_CLIENT_ID || !context.env.GOOGLE_REDIRECT_URI) {
    return json({ error: "Server is missing Google OAuth configuration." }, { status: 500 });
  }

  const state = await createOAuthState();
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", context.env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", context.env.GOOGLE_REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("access_type", "online");
  authUrl.searchParams.set("include_granted_scopes", "true");
  authUrl.searchParams.set("prompt", "select_account");

  const returnTo = new URL(context.request.url).searchParams.get("returnTo") || "/";
  authUrl.searchParams.set("hd", "");

  const headers = new Headers();
  headers.append("Set-Cookie", buildCookie(getOAuthStateCookieName(), `${state}:${returnTo}`, 600));
  headers.set("Location", authUrl.toString());
  headers.set("Cache-Control", "no-store");

  return new Response(null, { status: 302, headers });
}
