import { DurableObject } from "cloudflare:workers";

export class AdminRegistry extends DurableObject<Env> {
  private schemaInitialized = false;

  private ensureSchema() {
    if (this.schemaInitialized) return;
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        name TEXT PRIMARY KEY,
        host_key TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    this.schemaInitialized = true;
  }

  async fetch(request: Request): Promise<Response> {
    this.ensureSchema();
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/rooms" && request.method === "GET") {
      const rows = this.ctx.storage.sql
        .exec("SELECT name, host_key, created_at FROM rooms ORDER BY created_at DESC")
        .toArray();
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
      this.ctx.storage.sql.exec(
        "INSERT INTO rooms (name, host_key) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET host_key = excluded.host_key",
        name,
        hostKey
      );
      return Response.json({ ok: true, name });
    }

    const roomMatch = path.match(/^\/rooms\/([^/]+)(\/host-key)?$/);
    if (!roomMatch) return new Response("Not Found", { status: 404 });

    const roomName = decodeURIComponent(roomMatch[1]);
    const isHostKeyRequest = !!roomMatch[2];

    if (isHostKeyRequest && request.method === "GET") {
      const rows = this.ctx.storage.sql
        .exec("SELECT host_key FROM rooms WHERE name = ? LIMIT 1", roomName)
        .toArray();
      if (rows.length === 0) return Response.json({ found: false });
      return Response.json({ found: true, hostKey: rows[0].host_key });
    }

    if (!isHostKeyRequest && request.method === "DELETE") {
      this.ctx.storage.sql.exec("DELETE FROM rooms WHERE name = ?", roomName);
      return Response.json({ ok: true });
    }

    return new Response("Not Found", { status: 404 });
  }
}
