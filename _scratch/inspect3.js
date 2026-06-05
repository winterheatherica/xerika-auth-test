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
    try { n = (await c.query(`SELECT count(*)::int AS n FROM "${t}"`)).rows[0].n; } catch (e) { n = "err"; }
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
  const a = new Client({ ...base, database: "xerika-java" });
  await a.connect();
  const cols = await a.query("SELECT column_name FROM information_schema.columns WHERE table_name='clients' AND table_schema='public' ORDER BY ordinal_position");
  console.log("clients columns:", cols.rows.map(r=>r.column_name).join(", "));
  const cl = await a.query("SELECT * FROM clients ORDER BY client_id");
  console.log("\n=== clients rows ===");
  cl.rows.forEach((x) => console.log(JSON.stringify(x)));
  await a.end();

  await dump("kpjtik");
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
