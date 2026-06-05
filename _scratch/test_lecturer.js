const BASE = "http://localhost:3001";
const STUDENT_BASE = "http://localhost:3002";
const BASIC = "Basic a290YWtwZW5nYWR1YW4uanRpa0BnbWFpbC5jb206ZTUwNzQxNmE1YjY0ODk2OTRlNjM3MjAwYjE3MTA3Y2M4MGZkYWYxNjFlM2UzNWExNDJiNTEwNGIzMmI4Y2I2ZA==";

const LECTURER_NIP = "198501012010011001";
const ADMIN_NIP = "197003031995032001";
const PASSWORD = "Password123";

function mp(obj) { const fd = new FormData(); for (const [k, v] of Object.entries(obj)) fd.append(k, v); return fd; }
async function show(label, resp) {
  const text = await resp.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  console.log(`\n### ${label} -> HTTP ${resp.status}`);
  const s = typeof body === "string" ? body : JSON.stringify(body);
  console.log(s.length > 600 ? s.slice(0, 600) + "..." : s);
  return body;
}
const login = (base, idField, id) =>
  fetch(`${base}${base === BASE ? "/lecturer" : "/student"}/v1/login`, { method: "POST", headers: { Authorization: BASIC }, body: mp({ [idField]: id, password: PASSWORD }) });

(async () => {
  // 1. lecturer login
  let r = await fetch(`${BASE}/lecturer/v1/login`, { method: "POST", headers: { Authorization: BASIC }, body: mp({ nip: LECTURER_NIP, password: PASSWORD }) });
  const lec = await show("LECTURER login", r);
  const lecTok = lec?.data?.accessToken;

  // 2. lecturer profile
  r = await fetch(`${BASE}/lecturer/v1/profile`, { headers: { Authorization: `Bearer ${lecTok}` } });
  await show("GET /lecturer/v1/profile (lecturer token)", r);

  // 3. lecturer hitting a /super route -> forbidden (no admin role)
  r = await fetch(`${BASE}/super/v1/student`, { headers: { Authorization: `Bearer ${lecTok}` } });
  await show("GET /super/v1/student (LECTURER token, expect 401 forbidden)", r);

  // 4. admin login
  r = await fetch(`${BASE}/lecturer/v1/login`, { method: "POST", headers: { Authorization: BASIC }, body: mp({ nip: ADMIN_NIP, password: PASSWORD }) });
  const adm = await show("ADMIN login", r);
  const admTok = adm?.data?.accessToken;
  console.log("   admin roles:", JSON.stringify(adm?.data?.roles));

  // 5. admin list students
  r = await fetch(`${BASE}/super/v1/student`, { headers: { Authorization: `Bearer ${admTok}` } });
  await show("GET /super/v1/student (ADMIN token)", r);

  // 6. admin list lecturers
  r = await fetch(`${BASE}/super/v1/lecturer`, { headers: { Authorization: `Bearer ${admTok}` } });
  await show("GET /super/v1/lecturer (ADMIN token)", r);

  // 7. admin can also use lecturer routes (has lecturer role)
  r = await fetch(`${BASE}/lecturer/v1/profile`, { headers: { Authorization: `Bearer ${admTok}` } });
  await show("GET /lecturer/v1/profile (ADMIN token, also lecturer)", r);

  // 8. no token
  r = await fetch(`${BASE}/lecturer/v1/profile`);
  await show("GET /lecturer/v1/profile (NO token, expect 401)", r);

  // 9. admin registers a NEW student -> provisions auth user + local row
  const newNim = "2207411077";
  r = await fetch(`${BASE}/super/v1/student/register`, {
    method: "POST", headers: { Authorization: `Bearer ${admTok}` },
    body: mp({ name: "Dewi Lestari", nim: newNim, password: PASSWORD, phoneNumber: "6281234567890", major: "TIK" }),
  });
  await show(`POST /super/v1/student/register (admin creates student ${newNim})`, r);

  // 9b. that new student logs in on the STUDENT backend (cross-app!)
  r = await fetch(`${STUDENT_BASE}/student/v1/login`, { method: "POST", headers: { Authorization: BASIC }, body: mp({ nim: newNim, password: PASSWORD }) });
  await show(`STUDENT backend login for freshly-registered ${newNim} (cross-app e2e)`, r);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
