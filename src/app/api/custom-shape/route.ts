import { NextResponse } from "next/server";
// Development-only bridge to the isolated Python service. Hosted builds use
// the dedicated Python function directly, like the established labs.
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development")
    return NextResponse.json(
      { error: "Use /api/custom_shape." },
      { status: 404 },
    );
  const body = await request.text();
  if (body.length > 450000)
    return NextResponse.json({ error: "Drawing too large." }, { status: 413 });
  try {
    const response = await fetch("http://127.0.0.1:8791/api/custom_shape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(30000),
    });
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Start the Custom Shape service using its run.ps1 script." },
      { status: 503 },
    );
  }
}
