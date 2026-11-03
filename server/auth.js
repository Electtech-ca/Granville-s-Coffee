// Passwords (scrypt), database-backed sessions and role checks.
const crypto = require("crypto");
const db = require("./db");

const COOKIE = "gc_session";
const SESSION_DAYS = 14;
const ROLE_RANK = { staff: 1, manager: 2, owner: 3 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return "scrypt$" + salt.toString("base64") + "$" + hash.toString("base64");
}
function verifyPassword(password, stored) {
  const [scheme, saltB64, hashB64] = String(stored).split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, "base64"), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}
function passwordProblem(pw) {
  if (typeof pw !== "string" || pw.length < 10) return "Use at least 10 characters for the password.";
  return null;
}
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

async function createSession(res, req, userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  await db.query("insert into sessions(token_hash,user_id,expires_at) values ($1,$2, now() + ($3 || ' days')::interval)", [sha(token), userId, String(SESSION_DAYS)]);
  await db.query("update users set last_login_at=now() where id=$1", [userId]);
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? "; Secure" : ""}`);
}
async function destroySession(req, res) {
  const token = parseCookies(req)[COOKIE];
  if (token) await db.query("delete from sessions where token_hash=$1", [sha(token)]);
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

async function loadUser(req, _res, next) {
  try {
    const token = parseCookies(req)[COOKIE];
    if (token) {
      req.user = await db.one(
        "select u.id,u.email,u.name,u.role from sessions s join users u on u.id=s.user_id where s.token_hash=$1 and s.expires_at>now() and u.active",
        [sha(token)]
      );
    }
    next();
  } catch (e) { next(e); }
}

function requireRole(min) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Please sign in." });
    if (ROLE_RANK[req.user.role] < ROLE_RANK[min]) return res.status(403).json({ error: "Your role doesn't allow this. Ask the owner." });
    next();
  };
}

// Mutating admin requests must carry this header: browsers can't add it cross-site without CORS.
function csrfGuard(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("X-Requested-With") !== "granvilles-admin") return res.status(403).json({ error: "Missing request header." });
  next();
}

// Simple in-memory limiter for login and public forms.
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip + req.path;
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    arr.push(now);
    hits.set(key, arr);
    if (hits.size > 5000) hits.clear();
    if (arr.length > max) return res.status(429).json({ error: "Too many attempts. Please wait a few minutes." });
    next();
  };
}

async function audit(req, action, entity, entityId, details) {
  try {
    await db.query("insert into audit_log(user_id,action,entity,entity_id,details) values ($1,$2,$3,$4,$5)", [req.user?.id || null, action, entity, entityId == null ? null : String(entityId), details ? JSON.stringify(details) : null]);
  } catch (e) { console.error("[audit]", e.message); }
}

module.exports = { hashPassword, verifyPassword, passwordProblem, createSession, destroySession, loadUser, requireRole, csrfGuard, rateLimit, audit, ROLE_RANK };
