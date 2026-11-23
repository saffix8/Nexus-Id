// demo/sp-server.mjs
//
// A minimal Service Provider website ("Demo Job Portal") showing the SRS
// verification flow from the provider's side. No dependencies.
//
//   1. GET /          — the SP's server opens a session with its API key
//                       (API-030) and embeds only { sessionId, nonce } in the
//                       page (FR-043). The API key never reaches the browser.
//   2.                — the NexusID extension detects the snippet and relays it
//                       with its pairing token (API-032, FR-032).
//   3. GET /outcome   — when the page hears `nexusid:result`, it asks this
//                       server, which reads the outcome with its API key
//                       (API-031, FR-045). Page events are never trusted alone.
//
// Run:  node demo/sp-server.mjs        then open http://localhost:5500
// Env:  NEXUSID_API_KEY  (default: the seeded "Demo Job Portal" demo key)
//       NEXUSID_API_URL  (default: http://localhost:4000/api/v1)
//       PORT             (default: 5500)

import http from "node:http";

const PORT = Number(process.env.PORT ?? 5500);
const API_URL = (
  process.env.NEXUSID_API_URL ?? "http://localhost:4000/api/v1"
).replace(/\/+$/, "");
// Public demo key from services/backend/src/db/seed.ts — not a secret.
const API_KEY = process.env.NEXUSID_API_KEY ?? "demo_api_key_12345";
const REQUESTED_FIELDS = ["degree_title", "university"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function nexusid(path, init = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

function page({ sessionId, nonce, error }) {
  const snippet = error
    ? `<p class="error">Could not start NexusID verification: ${escapeHtml(error)}</p>`
    : `<div id="nexusid-verify"
           data-session-id="${escapeHtml(sessionId)}"
           data-nonce="${escapeHtml(nonce)}"></div>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Demo Job Portal — Job Application</title>
  <style>
    body { font-family: -apple-system, "Segoe UI", sans-serif; background: #f4f5f7; margin: 0; padding: 40px 16px; }
    .card { max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 4px 16px rgba(0,0,0,.08); }
    h1 { font-size: 20px; margin: 0 0 24px; }
    label { display: block; font-size: 13px; color: #555; margin: 16px 0 6px; }
    input { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; }
    .error { color: #b91c1c; font-size: 13px; }
    #server-check { margin-top: 16px; font-size: 13px; color: #374151; }
    #server-check strong { font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Apply — Software Engineer</h1>
    <label>Full name</label>
    <input type="text" placeholder="Jane Doe" />
    <label style="margin-top:24px">Verify your degree with NexusID</label>
    <!-- Opened by this site's server with its API key (API-030). Only the
         session ID and single-use nonce are in the page. -->
    ${snippet}
    <p id="server-check"></p>
  </div>
  <script>
    // FR-017: the extension reports the outcome on the page. Confirm it with
    // our own server (API-031) before trusting it.
    document.addEventListener('nexusid:result', async function (e) {
      var out = document.getElementById('server-check');
      var id = e.detail && e.detail.requestId;
      if (!id) { out.textContent = 'NexusID: ' + (e.detail && e.detail.status); return; }
      out.textContent = 'Confirming with our server…';
      try {
        var res = await fetch('/outcome?session=' + encodeURIComponent(id));
        var outcome = await res.json();
        out.innerHTML = '<strong>Server-confirmed outcome:</strong> ' +
          String(outcome.status).replace(/[<>&]/g, '') +
          (outcome.verifiedFields ? ' — ' + JSON.stringify(outcome.verifiedFields).replace(/[<>&]/g, '') : '');
      } catch (err) {
        out.textContent = 'Could not confirm with our server.';
      }
    });
  </script>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );

  try {
    if (req.method === "GET" && url.pathname === "/") {
      // API-030 — a fresh, single-use session on every page load.
      const created = await nexusid("/verification/sessions", {
        method: "POST",
        body: JSON.stringify({ requestedFields: REQUESTED_FIELDS }),
      });
      const html = created.ok
        ? page({
            sessionId: created.body.data.sessionId,
            nonce: created.body.data.nonce,
          })
        : page({ error: created.body.error ?? `HTTP ${created.status}` });
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(html);
      return;
    }

    if (req.method === "GET" && url.pathname === "/outcome") {
      // API-031 — read the outcome server-side with the API key.
      const sessionId = url.searchParams.get("session") ?? "";
      if (!UUID_RE.test(sessionId)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid session" }));
        return;
      }
      const outcome = await nexusid(
        `/verification/sessions/${sessionId}/outcome`,
      );
      res.writeHead(outcome.ok ? 200 : outcome.status, {
        "Content-Type": "application/json",
      });
      res.end(
        JSON.stringify(
          outcome.ok ? outcome.body.data : { error: outcome.body.error },
        ),
      );
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  } catch (err) {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end(`NexusID backend unreachable: ${err.message}`);
  }
});

server.listen(PORT, () => {
  console.log(`Demo Job Portal (Service Provider) on http://localhost:${PORT}`);
  console.log(`Using NexusID API at ${API_URL}`);
});
