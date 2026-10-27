// Liveness probe for docker compose.
export function GET() {
  return Response.json({ status: "ok" });
}
