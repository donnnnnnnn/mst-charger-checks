// MST charger spot checker. Runs on GitHub Actions every 5 minutes (see
// .github/workflows/check.yml): reads the four Market Square Tower ChargePoint ports from
// ChargePoint's public map and sends the reading to the MST Charging app, which keeps the
// spot log (how long each spot has been taken; when one is likely to open).
// No secrets: the app checks GitHub's signed OIDC token, which names this repository.
// Source of truth: checker/ in the private app repo.

const APP = "https://mst-charging.vercel.app/api/tesla/spots";
const AUDIENCE = "mst-charging-spots";
const PAYLOAD = {
  station_list: {
    ne_lat: 29.7828, ne_lon: -95.3431, sw_lat: 29.7428, sw_lon: -95.3831,
    page_size: 100, page_offset: "", sort_by: "distance",
    screen_width: 1346, screen_height: 658, filter: {},
    reference_lat: 29.7628, reference_lon: -95.3631, include_map_bound: true,
  },
  user_id: 0,
};
const TARGETS = { 168557: "SPACE 474", 164795: "SPACE 472 & 473" };

export async function readPorts() {
  const url = "https://mc.chargepoint.com/map-prod/get?" + encodeURIComponent(JSON.stringify(PAYLOAD));
  const r = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      Referer: "https://www.chargepoint.com/drivers",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error("ChargePoint HTTP " + r.status);
  const summaries = (await r.json())?.station_list?.summaries || [];
  const ports = {};
  for (const [id, label] of Object.entries(TARGETS)) {
    const s = summaries.find(x => x.device_id === Number(id));
    for (const [outlet, info] of Object.entries(s?.port_status || {})) ports[`${label}|${outlet}`] = info.status_v2 || info.status;
  }
  return ports;
}

// GitHub's signed proof that this run belongs to this repository (needs id-token: write).
async function oidcToken() {
  const { ACTIONS_ID_TOKEN_REQUEST_URL: u, ACTIONS_ID_TOKEN_REQUEST_TOKEN: t } = process.env;
  if (!u || !t) throw new Error("no OIDC (needs permissions: id-token: write)");
  const r = await fetch(u + "&audience=" + AUDIENCE, { headers: { Authorization: "Bearer " + t }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error("OIDC HTTP " + r.status);
  return (await r.json()).value;
}

export async function send(ports) {
  const r = await fetch(APP, {
    method: "POST",
    headers: { Authorization: "Bearer " + await oidcToken(), "Content-Type": "application/json" },
    body: JSON.stringify({ ports }),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("app HTTP " + r.status + " " + (j.error || ""));
  return j;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const ports = await readPorts();
    console.log(new Date().toISOString(), JSON.stringify(ports));
    console.log("app:", JSON.stringify(await send(ports)));
  } catch (e) {
    // Logged, not failed: GitHub emails on every failed scheduled run, and a hiccup at
    // ChargePoint or the app shouldn't mean an email every 5 minutes. The next run tries again.
    console.log("failed:", e.message);
  }
}
