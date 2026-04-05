import { AppContext, getFreeDailyCredits, getRemainingCredits, incrementUsageForToday, json, requireSession } from "../_lib/auth";
import { consumeSubscriptionQuota } from "../_lib/subscription";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE = 10 * 1024 * 1024;

export async function onRequestPost(context: AppContext): Promise<Response> {
  try {
    const auth = await requireSession(context);

    if (!auth) {
      return json(
        {
          error: "Please sign in with Google before removing backgrounds.",
          code: "AUTH_REQUIRED",
        },
        { status: 401 }
      );
    }

    const quota = await getRemainingCredits(context, auth.user.id);
    if (quota.remaining <= 0) {
      return json(
        {
          error: `Your current monthly quota has been used up. Please upgrade or wait for next month's reset.`,
          code: "QUOTA_EXCEEDED",
          quota,
        },
        { status: 403 }
      );
    }

    const apiKey = context.env.REMOVE_BG_API_KEY;

    if (!apiKey) {
      return json({ error: "Server is missing REMOVE_BG_API_KEY." }, { status: 500 });
    }

    const contentType = context.request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return json({ error: "Please upload an image." }, { status: 400 });
    }

    let file: File | null = null;
    try {
      const formData = await context.request.formData();
      file = formData.get("image_file") as File | null;
    } catch {
      return json({ error: "Failed to parse form data." }, { status: 400 });
    }

    if (!file) {
      return json({ error: "Please upload an image." }, { status: 400 });
    }

    if (!ACCEPTED_TYPES.has(file.type)) {
      return json({ error: "Unsupported file type. Please upload JPG, PNG, or WEBP." }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return json({ error: "File is too large. Please upload an image smaller than 10MB." }, { status: 400 });
    }

    const upstreamBody = new FormData();
    upstreamBody.append("image_file", file, file.name);
    upstreamBody.append("size", "auto");
    upstreamBody.append("format", "png");

    const response = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
      },
      body: upstreamBody,
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMsg =
        response.status === 402
          ? "Remove.bg API quota or billing limit reached."
          : `Failed to remove background. ${errorText || "Please try again later."}`;
      return json({ error: errorMsg }, { status: response.status });
    }

    const resultBuffer = await response.arrayBuffer();

    let quotaLimit = quota.limit;
    let quotaUsed = quota.used + 1;
    let quotaRemaining = Math.max(quota.remaining - 1, 0);

    if (quota.planCode) {
      const latestQuota = await consumeSubscriptionQuota(context, {
        userId: auth.user.id,
        actionType: "remove_background",
        consumeAmount: 1,
        requestId: crypto.randomUUID(),
      });
      quotaLimit = latestQuota?.quotaTotal ?? quotaLimit;
      quotaUsed = latestQuota?.quotaUsed ?? quotaUsed;
      quotaRemaining = latestQuota?.quotaRemaining ?? quotaRemaining;
    } else {
      quotaUsed = await incrementUsageForToday(context, auth.user.id);
      quotaLimit = getFreeDailyCredits(context.env);
      quotaRemaining = Math.max(quotaLimit - quotaUsed, 0);
    }

    return new Response(resultBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": 'attachment; filename="removed-background.png"',
        "Cache-Control": "no-store",
        "X-Quota-Limit": String(quotaLimit),
        "X-Quota-Used": String(quotaUsed),
        "X-Quota-Remaining": String(quotaRemaining),
      },
    });
  } catch (error) {
    console.error("remove-background function error", error);
    return json({ error: "Failed to remove background. Please try again later." }, { status: 500 });
  }
}
