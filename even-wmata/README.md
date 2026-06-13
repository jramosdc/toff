# DC Metro Board — Even Realities G2

A glasses app for [Even Hub](https://hub.evenrealities.com/) that shows the next
WMATA (Washington Metro) trains for the station you're standing closest to — in
**both directions**, just like the signs on the platform.

```
Metro Center
<0.1 mi · 7:02p
To Glenmont / Largo
 RD Glenmont        BRD
 BL Largo Town Ce…    3
 RD Glenmont          7
To Shady Grv / Vienna
 RD Shady Grove      ARR
 OR Vienna            5
 RD Shady Grove       9
```

- **Geolocation** picks the nearest station (and includes all transfer
  platforms at that location).
- **Both directions** are grouped by WMATA's track `Group` (1 / 2).
- Auto-refreshes every 20 s. **Tap** the glasses to refresh now;
  **double-tap** to exit.

## How it's built

A Vite + TypeScript web app that runs in the Even companion-app WebView and
drives the 576×288 glasses canvas via `@evenrealities/even_hub_sdk`. Logic runs
on the phone; the glasses render the display.

| File | Purpose |
|---|---|
| `src/main.ts` | Bridge setup, refresh loop, input/lifecycle, station caching |
| `src/wmata.ts` | WMATA client: stations, nearest-station grouping, predictions |
| `src/board.ts` | Formats predictions into the station-board text |
| `src/geo.ts` | `navigator.geolocation` + haversine distance |
| `src/mock.ts` | Offline sample data (`VITE_WMATA_MOCK=1`) |
| `app.json` | Even Hub manifest (`location` + `network` permissions) |
| `worker/wmata-proxy.js` | Cloudflare Worker: CORS + server-side API key for production |

## Run locally

```bash
cd even-wmata
npm install
cp .env.example .env        # add your WMATA key, or set VITE_WMATA_MOCK=1
npm run dev
```

Then preview on the glasses or simulator:

- **Simulator:** `npm run simulate`
- **Real glasses:** `npx evenhub qr --url http://<your-lan-ip>:5173` and scan with
  the Even Hub companion app.

In dev, `vite.config.ts` proxies `/api/wmata` → `https://api.wmata.com`, so the
browser/simulator isn't blocked by WMATA's missing CORS headers.

> No key handy? `VITE_WMATA_MOCK=1 npm run dev` renders the board from built-in
> sample data.

## Production: deploy the proxy

The Even WebView enforces full CORS and WMATA sends no CORS headers, so the
packaged app talks to a small Cloudflare Worker (free tier) that adds CORS and
holds your API key. See the header of `worker/wmata-proxy.js` for deploy steps,
then:

1. Set `VITE_WMATA_BASE=https://wmata-proxy.<you>.workers.dev` in `.env`
   (and do **not** set `VITE_WMATA_API_KEY` for prod — the Worker holds it).
2. Update the `network` permission `whitelist` in `app.json` to that same URL.

## Package for Even Hub

```bash
npm run build
npm run pack        # -> even-wmata.ehpk
```

Upload the `.ehpk` to the Even Hub dev portal to sideload or publish.

## Notes & limits

- The display is 16-shade greyscale with no font control, so the board uses a
  compact monospace-ish text layout rather than colored line bullets.
- A WMATA API key is free at <https://developer.wmata.com/>.
- Station list is cached in SDK local storage for 7 days; predictions are live.
