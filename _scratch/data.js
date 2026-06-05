const { Client } = require("pg");
const c = new Client({ host: "127.0.0.1", port: 15552, user: "postgres", password: "erika", database: "kpjtik" });
(async () => {
  await c.connect();
  for (const q of [
    "SELECT _id,name,nim,email,major,phoneNumber FROM student",
    "SELECT _id,name,email,lecturer_type FROM admin",
    "SELECT * FROM lecturer_type",
    "SELECT * FROM categories",
    "SELECT _id,student_id,category_id,lecturer_type,status,title,createdBy FROM complaint",
  ]) {
    try {
      const r = await c.query(q);
      console.log(`\n>>> ${q}\n(${r.rows.length} rows)`);
      r.rows.forEach((x) => console.log("   ", JSON.stringify(x)));
    } catch (e) { console.log(`\n>>> ${q}\n   ERR: ${e.message}`); }
  }
  await c.end();
})();
