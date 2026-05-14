export const runtime = "nodejs";
export const dynamic = "force-static";

export function GET() {
  return new Response(
    JSON.stringify({ status: "ok", service: "t2s-ui", version: "0.2.0" }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}
