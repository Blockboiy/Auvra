import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express, { type Request, type Response, type NextFunction } from "express";
import { createApp } from "./app.js";
import { getConfig } from "./config.js";

const config = getConfig();
const { app: apiApp } = createApp(config);
const production = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT ?? config.port);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Invalid listening port.");
}

if (!production) {
  apiApp.listen(port, "127.0.0.1", () => {
    console.log(`Auvra API listening at http://127.0.0.1:${port}`);
  });
} else {
  const password = process.env.AUVRA_DEMO_PASSWORD ?? "";
  const secret = process.env.AUVRA_SESSION_SECRET ?? "";
  if (password.length < 16 || secret.length < 32) {
    throw new Error("For public deployment, configure AUVRA_DEMO_PASSWORD (16+ characters) and AUVRA_SESSION_SECRET (32+ characters). Launch refused.");
  }

  const webDist = resolve(process.cwd(), "apps/web/dist");
  const indexFile = resolve(webDist, "index.html");
  if (!existsSync(indexFile)) throw new Error("Frontend build missing. Build the pnpm workspace before starting.");

  const gateway = express();
  gateway.disable("x-powered-by");
  gateway.use(express.urlencoded({ extended: false, limit: "2kb" }));

  const hmac = (expiry: string) => createHmac("sha256", secret).update(`auvra-demo:${expiry}`).digest("hex");
  const constantTimeEqual = (a: string, b: string): boolean => {
    const aHash = createHash("sha256").update(a).digest();
    const bHash = createHash("sha256").update(b).digest();
    return timingSafeEqual(aHash, bHash);
  };
  const authenticated = (request: Request): boolean => {
    const raw = request.headers.cookie?.match(/(?:^|;\s*)auvra_demo=([^;]+)/)?.[1] ?? "";
    const separator = raw.indexOf(".");
    if (separator < 1) return false;
    const expiry = raw.slice(0, separator);
    const signature = raw.slice(separator + 1);
    const expiresAt = Number(expiry);
    return /^\d{13}$/.test(expiry) && Number.isSafeInteger(expiresAt) && expiresAt > Date.now()
      && constantTimeEqual(signature, hmac(expiry));
  };
  const loginPage = (invalid = false) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Auvra · Demo access</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8f7fc;color:#211747;font:16px system-ui,sans-serif;padding:20px;box-sizing:border-box}main{background:#fff;padding:38px;max-width:390px;width:100%;border:1px solid #eae7f2;border-radius:24px;box-shadow:0 16px 50px #21174712}h1{margin:0 0 10px;font-size:27px}p{color:#77718c;line-height:1.5}label{display:block;font-size:14px;font-weight:600;margin:24px 0 8px}input{box-sizing:border-box;width:100%;padding:14px;border-radius:12px;border:1px solid #c9c5d7;font:inherit}button{margin-top:16px;width:100%;background:#6d35f7;color:white;padding:14px;border:0;border-radius:12px;font-weight:700;cursor:pointer}.error{color:#a62222}</style></head><body><main><h1>Auvra workspace</h1><p>This is a protected demonstration. Enter the access password provided by the Auvra team.</p>${invalid ? '<p class="error">Incorrect password. Try again.</p>' : ''}<form method="POST" action="/demo-login"><label for="password">Demo password</label><input id="password" name="password" type="password" autocomplete="current-password" required autofocus><button type="submit">Open workspace</button></form><p><a href="/">Back to public site</a></p></main></body></html>`;

  gateway.get("/demo-login", (request, response) => {
    if (authenticated(request)) return response.redirect(303, "/app");
    response.setHeader("Cache-Control", "no-store");
    response.type("html").send(loginPage());
  });
  gateway.post("/demo-login", (request, response) => {
    const submitted = typeof request.body?.password === "string" ? request.body.password : "";
    if (!constantTimeEqual(submitted, password)) {
      response.setHeader("Cache-Control", "no-store");
      response.status(401).type("html").send(loginPage(true));
      return;
    }
    const expiry = String(Date.now() + 8 * 60 * 60 * 1000);
    response.cookie("auvra_demo", `${expiry}.${hmac(expiry)}`, {
      httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 8 * 60 * 60 * 1000
    });
    response.redirect(303, "/app");
  });
  const protectApi = (request: Request, response: Response, next: NextFunction) => {
    response.setHeader("Cache-Control", "no-store");
    if (request.path === "/health" || authenticated(request)) return next();
    response.status(401).json({ error: { code: "ACCESS_REQUIRED", message: "Demo access required." } });
  };
  const protectWorkspace = (request: Request, response: Response, next: NextFunction) => {
    response.setHeader("Cache-Control", "no-store");
    if (authenticated(request)) return next();
    response.redirect(302, "/demo-login");
  };

  gateway.use("/api", protectApi);
  gateway.use("/app", protectWorkspace);
  gateway.use(express.static(webDist, { index: false }));
  gateway.use((request, response, next) => {
    if (request.method !== "GET" || request.path.startsWith("/api")) return next();
    response.sendFile(indexFile, { headers: { "Cache-Control": "no-store" } });
  });
  gateway.use(apiApp);

  gateway.listen(port, "0.0.0.0", () => {
    console.log(`Auvra public landing and protected workspace listening on 0.0.0.0:${port}`);
    console.log(`Orbio configured: ${Boolean(config.provider.apiKey)}; search configured: ${Boolean(config.webSearch?.apiKey)}`);
  });
}
