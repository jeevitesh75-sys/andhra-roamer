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
Extras: railway tracks + real stations, bridges over water, street lights, pedestrians/cows/dogs/goats you can hit (hitting a person starts a police chase: escape 500 m away for 10 s, or get fined if caught), map pins with a direction arrow (tap the big map).
URL options: `?time=day` / `?time=night`, `?region=vizag`, `?room=abc`.

## Controls
WASD/arrows drive (**S** brakes, then reverses; **REV** button on phones) · Space handbrake · H horn · L lights · C camera · J job board · F refuel at petrol stations (⛽ FUEL button on phones) · M map · V garage/vehicle · Enter chat · Esc menu. Touch controls on phones.
Friends join the same room code to drive together.

## Customise
`client/src/data.js` holds cities, roads, rivers, coast and hills (real lat/lon) — edit it to reshape the map.
Optional: put `three.module.js` (r160) in `client/vendor/` to avoid the CDN.
Tests: `node tests/server-test.js`, `node tests/physics-test.mjs`, `node tests/mesh-jobs-test.mjs`.

## Drop 1 additions
- Free-look camera: drag (mouse or finger) anywhere on the 3D view to look 360 degrees; it recentres after ~4.5 s idle while driving.
- Roof gun: hold G or tap FIRE; aims where the camera looks. Shoots police cars (4 hits to wreck), pedestrians and animals (shooting people raises wanted level).
- Police: up to 3 cars, wanted stars 1-5, ramming/collisions, SWAT van at 4+ stars, follow roads.
- Bridges: cars drive on the deck (no more falling under the road); parapets stop cars falling into the water.
- NOT yet included: on-foot exit/enter, 4-player story mode, police stations/motorcycles, voice chat.

## Drop 2
- Buttons: FIRE/EXIT-ENTER moved to their own pad left of GAS; side menu is a 2x2 grid (no overlaps).
- On foot: E (or EXIT/ENTER button) leaves the vehicle to a safe spot (not in walls/water/other vehicles); WASD walk, Shift run, Space/JUMP jump, drag to look; E near your vehicle to get back in. Vehicle stays parked; other players see the parked vehicle (their view of your character is not synced yet).
- Police by stars: 1 patrol (slower than you), 2 two faster cars, 3 + roadblocks ahead of you, 4 + SWAT van, 5 five units, fastest, 2 SWAT. Wrecked units are replaced, destroying one adds a star, escape distance grows with stars, fine = Rs 500 x stars.

## v3 - Exit/enter vehicles, joystick, GTA III map, police system, 4-player story
- **On foot**: E (or the ENTER button) gets you out/in. Phones get a floating **joystick** (left thumb, push fully to sprint), drag the right side to look, FIRE (auto-aim) and JUMP buttons - Free Fire / BGMI style. You can enter any parked car/bike/bus/lorry (static ones in every city + vehicles other players left). Other players see you exit, walk and enter. Exit spots avoid walls, water and other vehicles.
- **GTA III radar & map**: rotating circular radar with black ring and N, olive/slate palette, buildings, blips (blue P = police station, yellow ! = objective, red = enemies), health bar, green Rs counter, wanted stars. Same style on the full map (M).
- **Police**: stations on the map (real 3D, solid walls), roaming patrol cars + motorcycles, officers that stand/walk/investigate and chase on foot, wanted stars 1-5, shooting at 3+ stars, arrest -> custody -> release, police radio text. Existing chase (roadblocks, SWAT) kept.
- **Story mode** (menu button or T): ANDHRA UNDERWORLD - THE FOUR. 4 characters (Mastermind, Driver, Hacker, Inside Man), 6 chapters, cutscenes, role-specific missions, hacking mini-game, gang fights with a boss, votes that change the story, 3 endings (good / bad / secret). Empty roles are played by AI teammates; works offline too.
- Server additions: shared parked-vehicle pool, story engine (`server/story.js`), event relay. Tests: `node tests/story-sync-test.mjs`, `node tests/v3-smoke.mjs`.
- NOT included: voice chat, per-unit police sync to other players (each player runs their own chase; shared wanted not synced), real 3D visuals not verified in my sandbox (no three.js download).

## v3c changes
- **Layout**: the story/objective box no longer covers the radar (phones get a top-centre objective; the `is-touch` class is now also set on `<html>`).
- **Map**: the big map fills the whole screen, matches the canvas to your screen size and opens zoomed in on you (use +/- to zoom out).
- **Traffic**: 170 ambient vehicles - cars, **motorbikes**, buses, lorries - placed on roads around the cities.
- **Teammates**: empty story roles are played by **visible AI teammates** that follow you (convoy of cars while driving, characters on foot, with name tags, radar dots and off-screen arrows). Human friends get the same arrows + radar dots.
- **Together**: 👥 button / `T` teleports you next to the nearest friend in the room (same room code = same world).
- **Voice chat**: 🎤 button / `B` (tap again to mute). WebRTC peer-to-peer; the server only relays the signalling (`rtc` event). Needs https + microphone permission.
- **Full screen**: ⛶ button / `U` (also in the menu). Android Chrome also locks landscape. iPhone Safari has no full-screen API: use Share > Add to Home Screen.

## v3d changes
- **Connection**: the client now wakes the sleeping Render server with an HTTP hit first, retries every few seconds forever, accepts `https://`/bare host URLs, and shows which server it is trying. **Tap the status pill** (top / menu) to paste a different server URL - it is remembered on the device, so unzipping updates never resets it. Default `config.js` now points to `wss://andhra-roamer-server.onrender.com`. The server accepts `ALLOWED_ORIGINS=*` properly (it was rejecting every browser when set to `*`), plus any `*.vercel.app`. **Redeploy Render.**
- **After arrest / hospital**: you are put straight into a vehicle (full tank) on the road outside the station.
- **Dialogue voice**: story cutscenes and phone calls are read aloud with the browser's text-to-speech (different pitch per character; cutscene shots wait for the voice). Toggle with the 🔊 button in cutscenes or in the menu.
- **Custom HUD**: ⚙ (top-right) -> *Customize buttons*: drag any control / panel anywhere, tap it and use the slider to resize; saved on the device.
