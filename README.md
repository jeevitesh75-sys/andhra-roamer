# Andhra Roamer — multiplayer driving sim (car / bus / lorry) across Andhra Pradesh

## Deploy (free)
1. **Server → Render**: push this folder to GitHub → Render → New → Blueprint (uses `render.yaml`). Copy the URL, e.g. `https://andhra-roamer-server.onrender.com`.
   Free tier sleeps after ~15 min idle; first connect can take ~1 min (the game shows "waking server"). Ping `/health` with UptimeRobot to keep it awake.
2. **Client → Vercel**: New Project → import the repo → **Root Directory = `client`**, Framework "Other", no build command.
   Before that, edit `client/config.js`: `SERVER_URL: 'wss://andhra-roamer-server.onrender.com'`.
3. In Render set `ALLOWED_ORIGINS` to your Vercel URL.
Test locally: `cd server && node server.js`, serve `client/` (e.g. `npx serve client`), open `?server=ws://localhost:8080`.

## Real map (OpenStreetMap)
Three real regions ship in `client/data/`: **Vijayawada-Guntur**, **Visakhapatnam**, **Tirupati** (real roads, ~360k real buildings, water, land use, petrol stations, 1 game metre = 1 real metre). Pick the region in the menu; players in the same region + room code drive together.
To add/replace a region: download a BBBike GeoJSON extract and run `python3 tools/osm2game.py <id> "<Name>" <west> <south> <east> <north> <file.geojson> client/data`, then add it to `REGIONS` in `client/src/main.js`.
OSM has no elevation, so the ground is flat. Vizag's sea is not in the extract (empty land east of the coast).
URL options: `?time=day` / `?time=night`, `?region=vizag`, `?room=abc`.

## Controls
WASD/arrows drive (**S** brakes, then reverses; **REV** button on phones) · Space handbrake · H horn · L lights · C camera · J job board · F refuel at petrol stations (⛽ FUEL button on phones) · M map · V garage/vehicle · Enter chat · Esc menu. Touch controls on phones.
Friends join the same room code to drive together.

## Customise
`client/src/data.js` holds cities, roads, rivers, coast and hills (real lat/lon) — edit it to reshape the map.
Optional: put `three.module.js` (r160) in `client/vendor/` to avoid the CDN.
Tests: `node tests/server-test.js`, `node tests/physics-test.mjs`, `node tests/mesh-jobs-test.mjs`.
