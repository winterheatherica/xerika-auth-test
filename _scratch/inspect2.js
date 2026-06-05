const { Client } = require("pg");
const base = { host: "127.0.0.1", port: 15552, user: "postgres", password: "erika" };

async function dump(dbname) {
  const c = new Client({ ...base, database: dbname });
  await c.connect();
  const tables = await c.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1"
  );
  console.log(`\n========== DB: ${dbname} — tables (${tables.rows.length}) ==========`);
  for (const row of tables.rows) {
    const t = row.table_name;
    let n = "?";
    try { n = (await c.query(`SELECT count(*)::int AS n FROM "${t}"`)).rows[0].n; } catch (e) { n = "err:" + e.message; }
    // columns
    const cols = await c.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
      [t]
    );
    const colstr = cols.rows.map((x) => `${x.column_name}:${x.data_type}`).join(", ");
    console.log(`\n- ${t} (rows=${n})\n    ${colstr}`);
  }
  await c.end();
}

(async () => {
  // detailed user_roles + clients in auth db
  const a = new Client({ ...base, database: "xerika-java" });
  await a.connect();
  const ur = await a.query(`
    SELECT u.username, u.email, r.name AS role
    FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
    ORDER BY u.username`);
  console.log("=== user -> role ===");
  ur.rows.forEach((x) => console.log(` - ${x.username} (${x.email}) -> ${x.role}`));
  const cl = await a.query("SELECT client_id, client_type, pkce_required, scopes, grant_types FROM clients ORDER BY client_id");
  console.log("\n=== clients ===");
  cl.rows.forEach((x) => console.log(` - ${x.client_id} | type=${x.client_type} pkce=${x.pkce_required} scopes=${x.scopes} grants=${x.grant_types}`));
  const ru = await a.query("SELECT c.client_id, ru.uri FROM redirect_uris ru JOIN clients c ON c.id=ru.client_id ORDER BY 1");
  console.log("\n=== redirect_uris ===");
  ru.rows.forEach((x) => console.log(` - ${x.client_id} -> ${x.uri}`));
  await a.end();

  await dump("kpjtik");
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
