import { DurableObject } from "cloudflare:workers";

function normalizeStartAt(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

export class AdminRegistry extends DurableObject<Env> {
  private schemaInitialized = false;

  private ensureSchema() {
    if (this.schemaInitialized) return;
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        name TEXT PRIMARY KEY,
        host_key TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        start_at TEXT,
        cursors_enabled INTEGER NOT NULL DEFAULT 1
      )
    `);
    const columns = this.ctx.storage.sql.exec("PRAGMA table_info(rooms)").toArray() as Array<{
      name: string;
    }>;
    if (!columns.some((column) => column.name === "start_at")) {
      this.ctx.storage.sql.exec("ALTER TABLE rooms ADD COLUMN start_at TEXT");
    }
    if (!columns.some((column) => column.name === "cursors_enabled")) {
      this.ctx.storage.sql.exec(
        "ALTER TABLE rooms ADD COLUMN cursors_enabled INTEGER NOT NULL DEFAULT 1"
      );
    }
    this.ctx.storage.sql.exec("UPDATE rooms SET start_at = created_at WHERE start_at IS NULL");
    this.ctx.storage.sql.exec(
      "UPDATE rooms SET cursors_enabled = 1 WHERE cursors_enabled IS NULL"
    );
    this.schemaInitialized = true;
  }

  async fetch(request: Request): Promise<Response> {
    this.ensureSchema();
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/rooms" && request.method === "GET") {
      const rows = this.ctx.storage.sql
        .exec(
          "SELECT name, host_key, created_at, start_at, cursors_enabled FROM rooms ORDER BY created_at DESC"
        )
        .toArray();
      return Response.json(rows);
    }

    if (path === "/rooms" && request.method === "POST") {
      const body = (await request.json()) as {
        name?: string;
        hostKey?: string;
        startAt?: string;
        cursorsEnabled?: boolean;
      };
      const rawName = (body.name ?? "").trim();
      const hostKey = (body.hostKey ?? "").trim();
      const rawStartAt = typeof body.startAt === "string" ? body.startAt : "";
      const rawCursorsEnabled = body.cursorsEnabled;
      const normalizedStartAt = normalizeStartAt(rawStartAt);
      if (!rawName || !hostKey) {
        return Response.json({ error: "name and hostKey are required" }, { status: 400 });
      }
      if (rawStartAt.trim().length > 0 && normalizedStartAt === null) {
        return Response.json({ error: "Invalid startAt value" }, { status: 400 });
      }
      if (rawCursorsEnabled !== undefined && typeof rawCursorsEnabled !== "boolean") {
        return Response.json({ error: "Invalid cursorsEnabled value" }, { status: 400 });
      }
      const name = rawName
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      if (!name) {
        return Response.json({ error: "Invalid room name" }, { status: 400 });
      }

      const existingRows = this.ctx.storage.sql
        .exec("SELECT cursors_enabled FROM rooms WHERE name = ? LIMIT 1", name)
        .toArray() as Array<{ cursors_enabled: number }>;
      const existingCursorsEnabled = existingRows[0]?.cursors_enabled === 0 ? 0 : 1;
      const startAt = normalizedStartAt ?? new Date().toISOString();
      const cursorsEnabled =
        rawCursorsEnabled === undefined ? existingCursorsEnabled : rawCursorsEnabled ? 1 : 0;
      this.ctx.storage.sql.exec(
        "INSERT INTO rooms (name, host_key, start_at, cursors_enabled) VALUES (?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET host_key = excluded.host_key, start_at = excluded.start_at, cursors_enabled = excluded.cursors_enabled",
        name,
        hostKey,
        startAt,
        cursorsEnabled
      );
      return Response.json({ ok: true, name });
    }

    const roomMatch = path.match(/^\/rooms\/([^/]+)(\/host-key|\/start-time|\/cursors)?$/);
    if (!roomMatch) return new Response("Not Found", { status: 404 });

    const roomName = decodeURIComponent(roomMatch[1]);
    const routeSuffix = roomMatch[2] ?? "";
    const isHostKeyRequest = routeSuffix === "/host-key";
    const isStartTimeRequest = routeSuffix === "/start-time";
    const isCursorsRequest = routeSuffix === "/cursors";

    if (isHostKeyRequest && request.method === "GET") {
      const rows = this.ctx.storage.sql
        .exec("SELECT host_key FROM rooms WHERE name = ? LIMIT 1", roomName)
        .toArray();
      if (rows.length === 0) return Response.json({ found: false });
      return Response.json({ found: true, hostKey: rows[0].host_key });
    }

    if (isStartTimeRequest && request.method === "GET") {
      const rows = this.ctx.storage.sql
        .exec("SELECT start_at FROM rooms WHERE name = ? LIMIT 1", roomName)
        .toArray() as Array<{ start_at: string | null }>;
      if (rows.length === 0) return Response.json({ found: false });
      return Response.json({ found: true, startAt: rows[0].start_at });
    }

    if (isCursorsRequest && request.method === "GET") {
      const rows = this.ctx.storage.sql
        .exec("SELECT cursors_enabled FROM rooms WHERE name = ? LIMIT 1", roomName)
        .toArray() as Array<{ cursors_enabled: number }>;
      if (rows.length === 0) return Response.json({ found: false });
      return Response.json({ found: true, cursorsEnabled: rows[0].cursors_enabled !== 0 });
    }

    if (!isHostKeyRequest && !isStartTimeRequest && !isCursorsRequest && request.method === "DELETE") {
      this.ctx.storage.sql.exec("DELETE FROM rooms WHERE name = ?", roomName);
      return Response.json({ ok: true });
    }

    return new Response("Not Found", { status: 404 });
  }
}
