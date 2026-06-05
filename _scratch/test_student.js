const BASE = "http://localhost:3002";
const BASIC = "Basic a290YWtwZW5nYWR1YW4uanRpa0BnbWFpbC5jb206ZTUwNzQxNmE1YjY0ODk2OTRlNjM3MjAwYjE3MTA3Y2M4MGZkYWYxNjFlM2UzNWExNDJiNTEwNGIzMmI4Y2I2ZA==";

function mp(obj) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(obj)) fd.append(k, v);
  return fd;
}
async function show(label, resp) {
  const text = await resp.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  console.log(`\n### ${label} -> HTTP ${resp.status}`);
  console.log(typeof body === "string" ? body : JSON.stringify(body, null, 2));
  return body;
}

(async () => {
  // 1. login (multipart + basic)
  let r = await fetch(`${BASE}/student/v1/login`, { method: "POST", headers: { Authorization: BASIC }, body: mp({ nim: "2207411099", password: "Password123" }) });
  const login = await show("LOGIN (correct)", r);
  const token = login && login.data && login.data.accessToken;
  console.log("   token captured:", token ? token.slice(0, 14) + "..." : "NONE");

  // 2. profile (bearer)
  r = await fetch(`${BASE}/student/v1/profile`, { headers: { Authorization: `Bearer ${token}` } });
  await show("GET /student/v1/profile (bearer)", r);

  // 3. own complaints (likely empty -> 404)
  r = await fetch(`${BASE}/student/v1/complaint`, { headers: { Authorization: `Bearer ${token}` } });
  await show("GET /student/v1/complaint (own, before create)", r);

  // 4. create a complaint
  r = await fetch(`${BASE}/student/v1/complaint`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: mp({ category_id: "cat-perkuliahan", lecturer_type: "lt-akademik", title: "Proyektor kelas mati", body: "Proyektor di ruang 301 tidak menyala sejak pagi." }),
  });
  await show("POST /student/v1/complaint (create)", r);

  // 5. own complaints again
  r = await fetch(`${BASE}/student/v1/complaint`, { headers: { Authorization: `Bearer ${token}` } });
  await show("GET /student/v1/complaint (own, after create)", r);

  // 6. negative: no token
  r = await fetch(`${BASE}/student/v1/profile`);
  await show("GET /student/v1/profile (NO token, expect 401)", r);

  // 7. negative: wrong password
  r = await fetch(`${BASE}/student/v1/login`, { method: "POST", headers: { Authorization: BASIC }, body: mp({ nim: "2207411099", password: "wrongpass" }) });
  await show("LOGIN (wrong password, expect 404)", r);

  // 8. negative: bad bearer token
  r = await fetch(`${BASE}/student/v1/profile`, { headers: { Authorization: "Bearer not-a-real-token" } });
  await show("GET /student/v1/profile (BAD token, expect 401)", r);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
