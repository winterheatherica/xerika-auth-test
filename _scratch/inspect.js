const { Client } = require("pg");

async function tryConn(cfg) {
  const c = new Client(cfg);
  try {
    await c.connect();
    return c;
  } catch (e) {
    return { error: e.message, cfg };
  }
}

(async () => {
  // List databases first using a known-good maintenance db
  const base = { host: "127.0.0.1", port: 15552, user: "postgres", password: "erika" };
  let admin = await tryConn({ ...base, database: "postgres" });
  if (admin.error) {
    console.log("Cannot connect to 'postgres' db:", admin.error);
    // try with db xerika-java directly
  } else {
    const dbs = await admin.query("SELECT datname FROM pg_database WHERE datistemplate=false ORDER BY 1");
    console.log("=== Databases ===");
    dbs.rows.forEach((r) => console.log(" -", r.datname));
    await admin.end();
  }

  const c = await tryConn({ ...base, database: "xerika-java" });
  if (c.error) {
    console.log("\nCannot connect to xerika-java:", c.error);
    process.exit(0);
  }
  const tables = await c.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1"
  );
  console.log("\n=== Tables in xerika-java (public) ===");
  tables.rows.forEach((r) => console.log(" -", r.table_name));

  // If users/roles tables exist, count + sample
  const has = (n) => tables.rows.some((r) => r.table_name === n);
  for (const t of ["users", "roles", "user_roles", "clients", "user_sessions"]) {
    if (has(t)) {
      try {
        const cnt = await c.query(`SELECT count(*)::int AS n FROM ${t}`);
        console.log(`\n[${t}] count = ${cnt.rows[0].n}`);
      } catch (e) {
        console.log(`\n[${t}] count error: ${e.message}`);
      }
    }
  }
  if (has("roles")) {
    const r = await c.query("SELECT name, description FROM roles ORDER BY name");
    console.log("\n=== roles ===");
    r.rows.forEach((x) => console.log(" -", x.name, "|", x.description));
  }
  if (has("users")) {
    const r = await c.query("SELECT email, username, enabled, email_verified FROM users ORDER BY email LIMIT 20");
    console.log("\n=== users (max 20) ===");
    r.rows.forEach((x) => console.log(" -", x.email, "| username:", x.username, "| enabled:", x.enabled, "| verified:", x.email_verified));
  }
  await c.end();
})();
