interface Env {
  REMOVE_BG_API_KEY: string;
}

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE = 10 * 1024 * 1024;

export async function onRequestPost(context: {
  request: Request;
  env: Env;
  params: Record<string, string>;
}): Promise<Response> {
  try {
    const apiKey = context.env.REMOVE_BG_API_KEY;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Server is missing REMOVE_BG_API_KEY." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const contentType = context.request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return new Response(
        JSON.stringify({ error: "Please upload an image." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    let file: File | null = null;
    try {
      const formData = await context.request.formData();
      file = formData.get("image_file") as File | null;
    } catch {
      return new Response(
        JSON.stringify({ error: "Failed to parse form data." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!file) {
      return new Response(
        JSON.stringify({ error: "Please upload an image." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!ACCEPTED_TYPES.has(file.type)) {
      return new Response(
        JSON.stringify({ error: "Unsupported file type. Please upload JPG, PNG, or WEBP." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (file.size > MAX_SIZE) {
      return new Response(
        JSON.stringify({ error: "File is too large. Please upload an image smaller than 10MB." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build upstream form data
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
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: response.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const resultBuffer = await response.arrayBuffer();

    return new Response(resultBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": 'attachment; filename="removed-background.png"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("remove-background function error", error);
    return new Response(
      JSON.stringify({ error: "Failed to remove background. Please try again later." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
