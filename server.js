import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8000;
const GOOGLE_CLIENT_ID = "277482533691-uqgpo8eka7hhgv5usqic3b0f9hllsbmb.apps.googleusercontent.com";
const ADMIN_EMAIL = (process.env.AGAM_ADMIN_EMAIL || "akileshan2023@gmail.com").toLowerCase();
const IS_RENDER = Boolean(process.env.RENDER);
const ALLOWED_ORIGIN = process.env.AGAM_ALLOWED_ORIGIN || process.env.RENDER_EXTERNAL_URL || (IS_RENDER ? "" : `http://localhost:${PORT}`);
const SESSION_MAX_AGE = 12 * 60 * 60;
const SESSION_COOKIE = "agam_session";
const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
]);

if (!ALLOWED_ORIGIN) {
  throw new Error("Set AGAM_ALLOWED_ORIGIN to the public site URL before deploying.");
}

const allowedUrl = new URL(ALLOWED_ORIGIN);
if (allowedUrl.pathname !== "/" || allowedUrl.search || allowedUrl.hash) {
  throw new Error("AGAM_ALLOWED_ORIGIN must contain only the site origin, without a path.");
}

let sessionSecret;
if (process.env.AGAM_SESSION_SECRET) {
  sessionSecret = Buffer.from(process.env.AGAM_SESSION_SECRET, "utf8");
  if (sessionSecret.length < 32) {
    throw new Error("AGAM_SESSION_SECRET must be at least 32 characters long.");
  }
} else if (IS_RENDER) {
  throw new Error("Set AGAM_SESSION_SECRET to a random value of at least 32 characters.");
} else {
  sessionSecret = crypto.randomBytes(32);
  console.warn("Using a temporary session key; sessions will end when this server stops.");
}

const cookieSecurity = allowedUrl.protocol === "https:" ? "; Secure" : "";

function sendJson(response, status, payload, setCookie) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...(setCookie ? { "Set-Cookie": setCookie } : {}),
  });
  response.end(body);
}

function createSessionToken(email, name) {
  const payload = Buffer.from(JSON.stringify({
    email,
    name,
    expires: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function readSession(request) {
  const cookieHeader = request.headers.cookie || "";
  const cookie = cookieHeader.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) return null;

  const token = cookie.slice(SESSION_COOKIE.length + 1);
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;

  try {
    const expected = crypto.createHmac("sha256", sessionSecret).update(payload).digest();
    const provided = Buffer.from(signature, "base64url");
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) return null;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!session.email || !session.name || session.expires <= Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

function isSameOrigin(request) {
  return request.headers.origin === allowedUrl.origin &&
    (request.headers.host || "").toLowerCase() === allowedUrl.host;
}

async function readJsonBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 16_384) throw new Error("Sign-in request is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function verifyGoogleCredential(credential) {
  const url = new URL("https://oauth2.googleapis.com/tokeninfo");
  url.searchParams.set("id_token", credential);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const claims = await response.json();
    const expires = Number(claims.exp);
    if (
      claims.aud !== GOOGLE_CLIENT_ID ||
      !["accounts.google.com", "https://accounts.google.com"].includes(claims.iss) ||
      !claims.sub ||
      !["true", true].includes(claims.email_verified) ||
      !claims.email ||
      !Number.isFinite(expires) ||
      expires <= Math.floor(Date.now() / 1000)
    ) return null;
    const email = String(claims.email).toLowerCase();
    const name = String(claims.name || claims.given_name || email.split("@")[0]);
    return { email, name };
  } finally {
    clearTimeout(timeout);
  }
}

async function serveStatic(request, response, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendJson(response, 400, { error: "Invalid path." });
    return;
  }

  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  const filePath = path.resolve(ROOT, relativePath);
  const assetsRoot = path.resolve(ROOT, "assets");
  if (
    filePath !== path.join(ROOT, "index.html") &&
    filePath !== path.join(ROOT, "keychain-maker.html") &&
    !filePath.startsWith(`${assetsRoot}${path.sep}`)
  ) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      sendJson(response, 404, { error: "Not found." });
      return;
    }
    const contentType = MIME_TYPES.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
    response.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stats.size,
      "X-Content-Type-Options": "nosniff",
      ...(filePath === path.join(assetsRoot, "keychain-service-worker.js")
        ? { "Service-Worker-Allowed": "/" }
        : {}),
    });
    if (request.method === "HEAD") response.end();
    else response.end(await fs.readFile(filePath));
  } catch (error) {
    if (error.code === "ENOENT") sendJson(response, 404, { error: "Not found." });
    else throw error;
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, allowedUrl);
    if (request.method === "GET" && url.pathname === "/api/session") {
      const session = readSession(request);
      if (!session) {
        sendJson(response, 200, { authenticated: false });
        return;
      }
      sendJson(response, 200, {
        authenticated: true,
        name: session.name,
        email: session.email,
        isAdmin: session.email === ADMIN_EMAIL,
      });
      return;
    }

    if (request.method === "POST" && ["/api/auth/google", "/api/logout"].includes(url.pathname)) {
      if (!isSameOrigin(request)) {
        sendJson(response, 403, { error: "Request origin is not allowed." });
        return;
      }
      if (url.pathname === "/api/logout") {
        sendJson(response, 200, { ok: true }, `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cookieSecurity}`);
        return;
      }
      if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
        sendJson(response, 415, { error: "Sign-in request must use JSON." });
        return;
      }
      let body;
      try {
        body = await readJsonBody(request);
      } catch {
        sendJson(response, 400, { error: "Invalid sign-in request." });
        return;
      }
      if (typeof body.credential !== "string" || body.credential.length > 12_000) {
        sendJson(response, 400, { error: "Google did not provide a valid sign-in credential." });
        return;
      }
      let user;
      try {
        user = await verifyGoogleCredential(body.credential);
      } catch {
        sendJson(response, 401, { error: "Google sign-in token could not be verified." });
        return;
      }
      if (!user) {
        sendJson(response, 401, { error: "Google sign-in could not be verified for this website." });
        return;
      }
      const cookie = `${SESSION_COOKIE}=${createSessionToken(user.email, user.name)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${cookieSecurity}`;
      sendJson(response, 200, {
        authenticated: true,
        ...user,
        isAdmin: user.email === ADMIN_EMAIL,
      }, cookie);
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      await serveStatic(request, response, url.pathname);
      return;
    }
    sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    console.error("Request failed:", error.message);
    if (!response.headersSent) sendJson(response, 500, { error: "The request could not be completed." });
    else response.destroy();
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`AGAM site running on port ${PORT} (origin ${allowedUrl.origin})`);
});
