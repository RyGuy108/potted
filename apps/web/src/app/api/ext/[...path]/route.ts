import { handleExt } from "@/lib/ext-api";

export const dynamic = "force-dynamic";

// The extension runs on its own origin. Requests are authorised by a
// token in a header and never by a cookie, so any origin may call this
// without gaining anything a visitor could not already do.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "600",
};

async function respond(request: Request, path: string[]) {
  let body: Record<string, unknown> = {};
  if (request.method === "POST") {
    try {
      const parsed: unknown = await request.json();
      if (typeof parsed === "object" && parsed !== null) body = parsed as Record<string, unknown>;
    } catch {
      // An empty body is fine for actions that take no input.
    }
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  const result = await handleExt(request.method, path, new URL(request.url).searchParams, body, token);
  return Response.json(result.json, { status: result.status, headers: CORS });
}

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, { params }: Context) {
  return respond(request, (await params).path);
}

export async function POST(request: Request, { params }: Context) {
  return respond(request, (await params).path);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
