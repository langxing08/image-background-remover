import {
  AppContext,
  buildCookie,
  clearCookie,
  getBaseUrl,
  getOAuthStateCookieName,
  getSessionCookieName,
  getSessionMaxAgeSeconds,
  json,
} from "../../../_lib/auth";

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  id_token?: string;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
}

export async function onRequestGet(context: AppContext): Promise<Response> {
  const url = new URL(context.request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return redirectWithError(context, `Google login failed: ${error}`);
  }

  if (!code || !state) {
    return redirectWithError(context, "Missing OAuth callback parameters.");
  }

  const cookieHeader = context.request.headers.get("cookie") || "";
  const stateMatch = cookieHeader.match(/(?:^|; )oauth_state=([^;]+)/);
  const rawStateCookie = stateMatch ? decodeURIComponent(stateMatch[1]) : "";
  const [savedState, returnTo = "/"] = rawStateCookie.split(":");

  if (!savedState || savedState !== state) {
    return redirectWithError(context, "Invalid login state. Please try again.");
  }

  if (!context.env.GOOGLE_CLIENT_ID || !context.env.GOOGLE_CLIENT_SECRET || !context.env.GOOGLE_REDIRECT_URI) {
    return json({ error: "Server is missing Google OAuth configuration." }, { status: 500 });
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: context.env.GOOGLE_CLIENT_ID,
      client_secret: context.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: context.env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    const text = await tokenResponse.text();
    return redirectWithError(context, `Token exchange failed: ${text || tokenResponse.statusText}`);
  }

  const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;
  const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
    },
  });

  if (!userResponse.ok) {
    const text = await userResponse.text();
    return redirectWithError(context, `Failed to fetch Google user info: ${text || userResponse.statusText}`);
  }

  const userInfo = (await userResponse.json()) as GoogleUserInfo;

  if (!userInfo.sub || !userInfo.email) {
    return redirectWithError(context, "Google account is missing required profile fields.");
  }

  const existingUser = await context.env.DB.prepare(
    `SELECT id FROM users WHERE google_sub = ? LIMIT 1`
  )
    .bind(userInfo.sub)
    .first<{ id: string }>();

  const userId = existingUser?.id || crypto.randomUUID();

  if (existingUser) {
    await context.env.DB.prepare(
      `UPDATE users
       SET email = ?, name = ?, picture = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(userInfo.email, userInfo.name || null, userInfo.picture || null, userId)
      .run();
  } else {
    await context.env.DB.prepare(
      `INSERT INTO users (id, google_sub, email, name, picture)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(userId, userInfo.sub, userInfo.email, userInfo.name || null, userInfo.picture || null)
      .run();
  }

  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + getSessionMaxAgeSeconds(context.env) * 1000).toISOString();

  await context.env.DB.prepare(
    `INSERT INTO sessions (id, user_id, expires_at)
     VALUES (?, ?, ?)`
  )
    .bind(sessionId, userId, expiresAt)
    .run();

  const redirectUrl = new URL(returnTo, getBaseUrl(context.request, context.env));
  redirectUrl.searchParams.set("login", "success");

  const headers = new Headers();
  headers.append("Set-Cookie", buildCookie(getSessionCookieName(context.env), sessionId, getSessionMaxAgeSeconds(context.env)));
  headers.append("Set-Cookie", clearCookie(getOAuthStateCookieName()));
  headers.set("Location", redirectUrl.toString());
  headers.set("Cache-Control", "no-store");

  return new Response(null, { status: 302, headers });
}

function redirectWithError(context: AppContext, message: string): Response {
  const url = new URL(getBaseUrl(context.request, context.env));
  url.searchParams.set("login", "error");
  url.searchParams.set("message", message);

  const headers = new Headers();
  headers.append("Set-Cookie", clearCookie(getOAuthStateCookieName()));
  headers.set("Location", url.toString());
  headers.set("Cache-Control", "no-store");

  return new Response(null, { status: 302, headers });
}
