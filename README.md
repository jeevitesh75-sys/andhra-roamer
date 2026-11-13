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

## v3l - story-site models, SWAT and rifle (glTF)
New files in `client/assets/models/`: `swat.glb` (rigged SWAT officer, used for SWAT units - same animation set as the main character, helmet built in), `rifle.glb` (carried by SWAT and the boss), `club.glb`, `garage.glb`, `tavern.glb`, `gas_station.glb`, `bridge_a.glb`, `bridge_b.glb`, `phone.glb`.
`client/src/sites.js` shows the buildings/props near their story anchors (club -> Velvet Club, garage -> Karthik's Garage, tavern -> Naidu's Tea Stall, gas station -> highway ambush, bridge_a -> Old Bridge, bridge_b -> police checkpoint, phone -> yard terminal). Table: `SITES` in `glbassets.js` (size, side offset, visibility range).
They are visual only (no collision) and untested in a real browser: sizes/orientation come from bounding boxes, so tweak `SITES` if something looks off. `highway.glb` is not used (roads come from OpenStreetMap). Missing/failed files simply don't appear.

Code-built buildings (`client/src/buildings.js`, no model files): Abandoned Factory, King's Escape Port, Kondapalli Crew Den, Abandoned Warehouse, Port Godown (meeting) and the smuggling yard are placed at their story anchors by `sites.js`. Police stations already had a built-in model. Visual only, untested in a browser; adjust `BUILDINGS`.

## v3n - Raghav's gang and The King (Mixamo man + hats)
`man.glb` (rigged Mixamo man, one walk clip - played in place, frozen when standing, tipped over when dead), `hat_cowboy.glb`, `hat_top.glb`. Gang thugs/rivals wear the cowboy hat, the gang boss and The King (cutscenes) the top hat; Dasari/Pasha cutscene actors get the cowboy hat. Hats are attached to the head bone and sized from the head (`_manHat` in characters.js). Also fixed: hand-bone lookup now handles three's name sanitising (`Fist.R` -> `FistR`) so pistol/rifle follow the hand. Untested visually: hat height/size and man scale come from measured bounds.

## v3o - new characters, romance scenes, neon night
- Characters (Quaternius): `casual.glb` (Arjun, half the gang), `man2.glb` (Karthik, The King, Dasari, Dev, other half of the gang), `woman_a.glb` (Lakshmi, Sravani), `woman_b.glb` (Rani). Chosen by `rig` in `ROLES`/`NPCS` (storydata.js) and in the `C.set(...)` calls in main.js. Arjun now wears maroon/dark blue, Karthik teal/charcoal (`shirt`/`pants` in ROLES). The King and the boss wear the top hat, thugs/Dasari/Pasha the cowboy hat.
- Cutscene acting: the speaker sways and gestures (Interact clip where the rig has one), everyone else breathes/idles; lovers face each other and lean in.
- Guns: the hand bone is now found on every rig (three renames `Fist.R` to `FistR`), with a chest-height fallback, so the pistol/rifle show while firing.
- New story cutscenes (also added to `server/story.js`): `c2_queen` (The King and Rani, hug then kiss, right after the Chapter 2 intro) and `c3_sravani` (Karthik and Sravani, after "The Net Tightens", tied to his secret talks with Dev). Clothed, no explicit content. Arms are not posed around each other (no hug clip exists in the models).
- Night: magenta/violet haze sky, brighter moon and ambient light, stronger window glow, higher exposure (scene.js `updateSky`).
Untested visually. Tint targets (`White`/`LightBlue` on casual, `Shirt`/`Pants` on man2, `Red` on woman_b) are guesses from material names.

v3p: hugs/kisses now pose the skeleton - `_embrace()` in characters.js rotates both arms of each lover around the partner (upper arm forward/out, forearm across the partner's back; higher for the kiss), whatever the rig's bone axes are. Untested visually; tune the direction vectors in `_embrace` if arms look off.

## v3q - drifting and PC camera
- Drift: hold brake (S, Space or the touch BRAKE) and steer, or hold Shift (PC) / the purple DRIFT button (touch) while turning above ~30 km/h in a car/bike. The tyres let go, the car slides up to ~35 degrees and keeps its speed (the handbrake/Space still brakes into a slide). Skid sound is on already. `drift` in physics.js, tested in physics-test.mjs.
- Camera on PC: mouse listeners moved from the canvas to the whole document (HUD layers were eating them); drag with either mouse button, or click the scene once to capture the mouse (Esc releases) and just move it. Q/E or [ ] also turn the camera. Mouse wheel still zooms.

## v3s - zero-cut drift for every vehicle + bike rider
- Drift (brake + steer, Shift or the DRIFT button) is now a BGMI-style zero-cut for car, bike, bus and lorry: a quick type-scaled flick of the nose, a partial-grip slide, and the sideways speed is carried into the new heading on exit (see `drift` / `driftHold` in physics.js, tests in physics-test.mjs). Tune `2.0 * tf`, the `tf` table and `drift ? 0.07` there.
- The player is now visible on bikes: a crouched, leaning rider rig (`me_rider` in main.js renderWorldExtras). Other players' bikes still show no rider.

## v3t - finding your friend in a room
- The room name is `<region>-<code>`, so two players on different regions are in different rooms even with the same code. Pause menu now shows region + code and an invite link (tap to copy); `?region=..&room=..` in the URL now overrides the saved room.
- Players who pick different start cities spawn far apart: a compass arrow + distance to the nearest friend shows on screen when they are out of sight, the second player to join is moved next to the friend already in the room (once, within 30 s of joining), name tags are visible up to 700 m, and TEAM still jumps to a friend.

## v3u changes
- Cutscene black bars fixed (the letterbox bars were inheriting the HUD `.bar` width).
- App icon: your Andhra Underworld artwork (favicon, home-screen icon, manifest.webmanifest, loading screen).
- Real raised bridges: roads that cross water now climb a ramp onto a 3-6.5 m high deck with piers; you drive up and over. The story "Old Bridge" is a real bridge; the floating bridge prop was removed. (tests/bridge-test.mjs)
- Solid buildings: the club, garage, tavern, factory, port, den, warehouse and yard have collisions for you and vehicles.
- Interactive missions for both friends: collect items, talk to people (F / TALK button), timed drives. Each friend has their own steps.
- Roof gun removed: shoot with the pistol from the car window while driving.
- Car colours fixed (Lamborghini texture neutralised so paint tints properly); more traffic (480).

## v3v changes
- Vehicles wherever you spawn (v3w: ids fixed so the server accepts them): every story chapter / cutscene drop-in now seeds 8-10 parked cars, bikes (and sometimes a bus/lorry) on the roads around you (ParkedLot.seed).
- Vice-City carjacking: walk into the road and moving traffic brakes to a stop; press E (or the action button) next to any traffic vehicle to pull the driver out - he runs off - and drive away in it (1 wanted star outside story missions). The car comes back into traffic after ~2.5 minutes.
- tests/carjack-test.mjs

## v3x - Polyfork model pack (optional, free)
Run once from the project root (Termux: `pkg install curl`): `bash tools/get-polyfork.sh` - it downloads 50 free GLBs from polyfork.dev into `client/assets/models/pf/` and writes `pf/manifest.json`.
Then the game uses them automatically (anything missing falls back to the old models):
- 23 extra vehicles in traffic/parked: taxi, hatchback, SUV, minivan, jeep, sedan, kei van, pickup, police cruiser, delivery/flatbed/goods lorries, garbage truck, tow truck, ambulance, fire engine, city/school/shuttle/mini/articulated buses, moped, touring motorcycle.
- Civic buildings at fixed places: police station (story station), government hospital, fire station, bank, school, temple, shops, clock tower, market stall (anchors in storydata ANCHORS).
- Street people (8 adults + 2 kids) and animals (cow/ox, dogs, goat/sheep) replace the box figures for the nearest 28 people / 28 animals.
- Edit the list in tools/pf-ids.txt + src/pfpack.js to use other models. Vehicles are assumed to face +Z (or are auto-turned if their length is along X).
