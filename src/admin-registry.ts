import { DurableObject } from "cloudflare:workers";
import { eq, desc } from "drizzle-orm";
import { runMigrations, schema } from "./db";
import type { AppDb } from "./db";

export class AdminRegistry extends DurableObject<Env> {
  private db: AppDb | null = null;

  private getDb(): AppDb {
    if (!this.db) {
      this.db = runMigrations(this.ctx.storage);
    }
    return this.db;
  }

  async fetch(request: Request): Promise<Response> {
    const db = this.getDb();
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/rooms" && request.method === "GET") {
      const rows = db
        .select({
          name: schema.rooms.name,
          host_key: schema.rooms.hostKey,
          created_at: schema.rooms.createdAt,
        })
        .from(schema.rooms)
        .orderBy(desc(schema.rooms.createdAt))
        .all();
      return Response.json(rows);
    }

    if (path === "/rooms" && request.method === "POST") {
      const body = (await request.json()) as { name?: string; hostKey?: string };
      const rawName = (body.name ?? "").trim();
      const hostKey = (body.hostKey ?? "").trim();
      if (!rawName || !hostKey) {
        return Response.json({ error: "name and hostKey are required" }, { status: 400 });
      }
      const name = rawName
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      if (!name) {
        return Response.json({ error: "Invalid room name" }, { status: 400 });
      }
      db.insert(schema.rooms)
        .values({ name, hostKey })
        .onConflictDoUpdate({
          target: schema.rooms.name,
          set: { hostKey },
        })
        .run();
      return Response.json({ ok: true, name });
    }

    const roomMatch = path.match(/^\/rooms\/([^/]+)(\/host-key)?$/);
    if (!roomMatch) return new Response("Not Found", { status: 404 });

    const roomName = decodeURIComponent(roomMatch[1]);
    const isHostKeyRequest = !!roomMatch[2];

    if (isHostKeyRequest && request.method === "GET") {
      const rows = db
        .select({ hostKey: schema.rooms.hostKey })
        .from(schema.rooms)
        .where(eq(schema.rooms.name, roomName))
        .limit(1)
        .all();
      if (rows.length === 0) return Response.json({ found: false });
      return Response.json({ found: true, hostKey: rows[0].hostKey });
    }

    if (!isHostKeyRequest && request.method === "DELETE") {
      db.delete(schema.rooms)
        .where(eq(schema.rooms.name, roomName))
        .run();
      return Response.json({ ok: true });
    }

    return new Response("Not Found", { status: 404 });
  }
}
