import { NextResponse } from "next/server";

const ACCEPTET_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const apiKey = process.env.REMOVE_BG_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Server is missing REMOVE_BG_API_KEY." },
        { status: 500 }
      );
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Please upload an image." },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("image_file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Please upload an image." },
        { status: 400 }
      );
    }

    if (!ACCEPTED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload JPG, PNG, or WEBP." },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File is too large. Please upload an image smaller than 10MB." },
        { status: 400 }
      );
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
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        {
          error:
            response.status === 402
              ? "Remove.bg API quota or billing limit reached."
              : `Failed to remove background. ${errorText || "Please try again later."}`,
        },
        { status: response.status }
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
    console.error("remove-background route error", error);
    return NextResponse.json(
      { error: "Failed to remove background. Please try again later." },
      { status: 500 }
    );
  }
}
