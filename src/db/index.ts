import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import * as schema from "./schema";
import migrations from "../../drizzle/migrations";

export function createDb(storage: DurableObjectStorage) {
  return drizzle(storage, { schema });
}

export function runMigrations(storage: DurableObjectStorage) {
  const db = drizzle(storage, { schema });
  migrate(db, migrations);
  return db;
}

export type AppDb = ReturnType<typeof createDb>;
export { schema };
