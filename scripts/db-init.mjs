import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL. Configura PostgreSQL local en .env.local.");
  process.exit(1);
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query(readFileSync(join(process.cwd(),"sql/001_monolito.sql"),"utf8"));
  await client.query("COMMIT");
  console.log("OK: PostgreSQL preparado con clientes, productos, sesiones y pedidos; menú de prueba insertado.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("No se pudo inicializar la base de datos:", error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
