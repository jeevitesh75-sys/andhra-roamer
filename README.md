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
- **Story mode** (menu button or T): **ANDHRA UNDERWORLD: BLOOD & BETRAYAL** - two-player co-op (Arjun & Karthik), 6 chapters / 39 steps / 20 missions, 88 spoken lines, 3 endings that depend on your decisions (jail route, forgive or stay cold, trust Dev or not). Missions: driving, free roam, hold/hack/escape/gang fights, police chases, checkpoints, arrest + interrogation, jail escape or legal release. Dialogue is read aloud (browser speech, per-character voices; toggle with the speaker button in cutscenes or in the menu). A lone player gets an AI partner.
- Server additions: shared parked-vehicle pool, story engine (`server/story.js`), event relay. Tests: `node tests/story-sync-test.mjs`, `node tests/v3-smoke.mjs`.
- NOT included: voice chat, per-unit police sync to other players (each player runs their own chase; shared wanted not synced), real 3D visuals not verified in my sandbox (no three.js download).

## v3e fixes
- Voice chat: fixed a signalling loop that broke connections; added TURN fallback, voice volume, connected-count on the mic button.
- ⚙ Settings button (top right) with graphics, volumes, mic, full screen, go-to-friends, story.
- Pedestrians always stay on the footpath.
- After a team step you now see who you are waiting for and what they must do; "CONTINUE WITHOUT THEM" appears after 20 s.

## v3f
- AI teammates are now ONE shared set per room (host simulates, everyone sees). Each AI follows one human (round-robin), so with 2 players + 2 AI each of you gets your own companion.
- Gang fights are started by whichever player reaches the fight first (non-host asks the host), so nobody is left waiting with no objective.

## v3g
- After jail / hospital your vehicle is brought to the station road and you get in automatically (fuel refilled).
- Fixed: once the host finished its own part, the host stopped simulating/syncing the gang, so teammates saw frozen enemies and waited forever. The host now keeps the fight running.
- If the fight is already won, teammates still on an earlier objective (gate scouting, hacking...) are auto-finished.

## v3h
- Settings has a 'Server address' box (saved on the phone) so you can fix a wrong/missing server without redeploying. If config.js still points at localhost the client falls back to wss://andhra-roamer-server.onrender.com.

## v3i
- Passengers: walk next to a friend's vehicle and press E / ENTER ('ride with <name>'). While riding you stand on the vehicle, can aim (drag) and FIRE at gang members, police cars and officers; friends see you and your shots. E again to get off.

## v3j changes
- Complete story replacement (see above). `client/src/storydata.js` is the script, `server/story.js` the shared step engine; `tests/story2-test.mjs` plays all three endings with two simulated players.
- After jail you are put straight behind the wheel of a fuelled vehicle on the road outside the station.
- **Edit HUD** (menu): drag any control, tap it and resize it; saved on your device.

## v3k - real 3D models (glTF)
- `client/assets/models/*.glb`: Lamborghini (player/traffic cars), police car, truck (lorry), school bus, 2 motorcycles, animated character, pistol, tree.
- `client/src/glbassets.js` loads and prepares them; `models.js`, `characters.js` and `scene.js` use them and **fall back to the old box models** if anything fails to load.
- **Wheels really spin and steer**: the Lamborghini, police car and truck have wheel meshes; the bus and both bikes had wheels fused into the body, so they are cut out at load time (see `VEHICLES` in glbassets.js).
- Characters (you, partners, gang, officers) use the Quaternius rig: Idle / Walk / Run / Death / aiming stance, pistol in the right hand. Shirt/pants colours are tinted per role.
- Round trees in forests use your tree model (still instanced, cheap); palms stay procedural.
- Vehicle sizes changed in `physics.js` SPECS (car 4.4x2.0, bus 9.4x2.7, lorry 6.8x2.7) so collisions match the models.
- `index.html` has an import map (three + GLTFLoader from jsDelivr, three r160). Test: `node tests/glb-assets-test.mjs`.

## v3l - more GLB models (SWAT, rifle, landmark props)
- `swat.glb` + `rifle.glb`: police officers (hat = cap) now use the SWAT model with Idle_Gun / Idle_Gun_Pointing / Walk / Run / Death and carry the assault rifle. Civilians/gang keep the Quaternius character + pistol.
- `gas_station.glb`, `tavern.glb` are placed beside a road near the start town; `garage.glb`, `club.glb` at the story anchors `garage` / `club`. They get collision boxes, are shown within ~380 m and removed beyond (src/props.js).
- Everything falls back to the old models / nothing if a file fails to load.
- NOT used yet: phone, highway, 2 bridges (no sensible place without road-geometry work), Google Drive packs (not imported; awaiting approval).
- Untested on real hardware: actual GLB rendering, rifle grip/barrel orientation, prop orientation (which side is the "front") and placement on the real map. Logic tests: `node tests/props-test.mjs`, `node tests/glb-assets-test.mjs`.
