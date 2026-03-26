import handler from "@tanstack/react-start/server-entry";
import { routePartykitRequest } from "partyserver";

export { PollRoom } from "./poll-room";
export { AdminRegistry } from "./admin-registry";

function getRole(role: string | null): "host" | "projector" | "audience" {
  if (role === "host" || role === "projector") return role;
  return "audience";
}

function getAdminKey(env: Env): string | undefined {
  return "ADMIN_KEY" in env ? (env as { ADMIN_KEY?: string }).ADMIN_KEY : undefined;
}

function checkAdminAuth(request: Request, env: Env): Response | null {
  const adminKey = getAdminKey(env);
  if (!adminKey) {
    return new Response("ADMIN_KEY not configured", { status: 500 });
  }
  const authHeader = request.headers.get("x-admin-key") ?? "";
  const url = new URL(request.url);
  const queryKey = url.searchParams.get("adminKey") ?? "";
  if (authHeader !== adminKey && queryKey !== adminKey) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

function getRegistryStub(env: Env): DurableObjectStub {
  const id = env.AdminRegistry.idFromName("global");
  return env.AdminRegistry.get(id);
}

async function lookupRoomHostKey(env: Env, roomName: string): Promise<string | null> {
  const stub = getRegistryStub(env);
  const resp = await stub.fetch(
    new Request(`http://internal/rooms/${encodeURIComponent(roomName)}/host-key`)
  );
  const data = (await resp.json()) as { found: boolean; hostKey?: string };
  return data.found && data.hostKey ? data.hostKey : null;
}

async function lookupRoomStartAt(env: Env, roomName: string): Promise<string | null> {
  const stub = getRegistryStub(env);
  const resp = await stub.fetch(
    new Request(`http://internal/rooms/${encodeURIComponent(roomName)}/start-time`)
  );
  const data = (await resp.json()) as { found: boolean; startAt?: string | null };
  if (!data.found) return null;
  return typeof data.startAt === "string" && data.startAt.length > 0 ? data.startAt : null;
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

    const roomStartTimeMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/start-time$/);
    if (roomStartTimeMatch && request.method === "GET") {
      const roomName = decodeURIComponent(roomStartTimeMatch[1]);
      const startAt = await lookupRoomStartAt(env, roomName);
      return Response.json(
        { room: roomName, startAt },
        { headers: { "cache-control": "no-store" } }
      );
    }

    if (url.pathname.startsWith("/api/admin")) {
      return handleAdminApi(request, env, url);
    }

    const hostKeyFromEnv =
      "HOST_KEY" in env ? (env as { HOST_KEY?: string }).HOST_KEY : undefined;
    const partyResponse = await routePartykitRequest(request, env, {
      async onBeforeConnect(req) {
        const reqUrl = new URL(req.url);
        const role = getRole(reqUrl.searchParams.get("role"));
        if (role !== "host") return;

        const roomName = reqUrl.pathname.split("/").filter(Boolean).pop() ?? "";
        const roomSpecificKey = await lookupRoomHostKey(env, roomName);
        const effectiveHostKey = roomSpecificKey ?? hostKeyFromEnv;

        if (!effectiveHostKey) {
          return new Response("HOST_KEY is not configured for this worker.", {
            status: 500,
          });
        }

        const hostKey =
          reqUrl.searchParams.get("hostKey") ?? reqUrl.searchParams.get("key") ?? "";
        if (hostKey !== effectiveHostKey) {
          return new Response("Unauthorized host key.", { status: 401 });
        }
      },
    });

    if (partyResponse) return partyResponse;

    return handler.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;

async function handleAdminApi(request: Request, env: Env, url: URL): Promise<Response> {
  const authError = checkAdminAuth(request, env);
  if (authError) return authError;

  const path = url.pathname.replace(/^\/api\/admin/, "");

  if (path === "/rooms" && request.method === "GET") {
    const stub = getRegistryStub(env);
    const resp = await stub.fetch(new Request("http://internal/rooms"));
    return resp;
  }

  if (path === "/rooms" && request.method === "POST") {
    const stub = getRegistryStub(env);
    const resp = await stub.fetch(
      new Request("http://internal/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: await request.text(),
      })
    );
    return resp;
  }

  const roomStatsMatch = path.match(/^\/rooms\/([^/]+)\/stats$/);
  if (roomStatsMatch && request.method === "GET") {
    const roomName = decodeURIComponent(roomStatsMatch[1]);
    const roomId = env.PollRoom.idFromName(roomName);
    const roomStub = env.PollRoom.get(roomId);
    const resp = await roomStub.fetch(new Request("http://internal/stats"));
    return resp;
  }

  const roomResetMatch = path.match(/^\/rooms\/([^/]+)\/reset$/);
  if (roomResetMatch && request.method === "POST") {
    const roomName = decodeURIComponent(roomResetMatch[1]);
    const roomId = env.PollRoom.idFromName(roomName);
    const roomStub = env.PollRoom.get(roomId);
    const resp = await roomStub.fetch(
      new Request("http://internal/reset", { method: "POST" })
    );
    return resp;
  }

  const roomDeleteMatch = path.match(/^\/rooms\/([^/]+)$/);
  if (roomDeleteMatch && request.method === "DELETE") {
    const roomName = decodeURIComponent(roomDeleteMatch[1]);
    const stub = getRegistryStub(env);
    const resp = await stub.fetch(
      new Request(`http://internal/rooms/${encodeURIComponent(roomName)}`, {
        method: "DELETE",
      })
    );
    return resp;
  }

  return new Response("Not Found", { status: 404 });
}
