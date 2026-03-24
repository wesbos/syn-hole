import handler from "@tanstack/react-start/server-entry";
import { routePartykitRequest } from "partyserver";

export { PollRoom } from "./poll-room";

function getRole(role: string | null): "host" | "projector" | "audience" {
  if (role === "host" || role === "projector") return role;
  return "audience";
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/bootstrap") {
      if (request.method === "HEAD") {
        return new Response(null, {
          status: 200,
          headers: { "cache-control": "no-store" },
        });
      }
      if (request.method === "GET") {
        const city = (request.cf as { city?: string } | undefined)?.city?.trim();
        const defaultAudienceName =
          city && city.length > 0 ? `Anon from ${city}` : "Anon from somewhere";
        return Response.json(
          { defaultAudienceName },
          { headers: { "cache-control": "no-store" } }
        );
      }
      return new Response("Method Not Allowed", { status: 405 });
    }

    const hostKeyFromEnv =
      "HOST_KEY" in env ? (env as { HOST_KEY?: string }).HOST_KEY : undefined;
    const partyResponse = await routePartykitRequest(request, env, {
      onBeforeConnect(req) {
        const reqUrl = new URL(req.url);
        const role = getRole(reqUrl.searchParams.get("role"));
        if (role !== "host") return;

        if (!hostKeyFromEnv) {
          return new Response("HOST_KEY is not configured for this worker.", {
            status: 500,
          });
        }

        const hostKey =
          reqUrl.searchParams.get("hostKey") ?? reqUrl.searchParams.get("key") ?? "";
        if (hostKey !== hostKeyFromEnv) {
          return new Response("Unauthorized host key.", { status: 401 });
        }
      },
    });

    if (partyResponse) return partyResponse;

    return handler.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
