# Emberyard — a three.js tactical FPS

Entry for make.fun `threejs-fps-01`: "Make the best three.js tactical FPS".
A complete round-based tactical shooter in the style Counter-Strike made
famous, with an original map, art, sounds and names. No network requests;
everything is static files under `game/` plus three.js 0.187.0 from the kit.

## The game

- **Rustyard**, a 64 x 48 m industrial depot: two plant sites (Silo west,
  Crane east), three lanes, crates, containers, silos and a gantry crane.
- **5v5, first to 5 (max 9 rounds), 100 s rounds, 15 s buy phase.** Vanguard
  (you + 4 bots) defends; Ember (5 bots) attacks and plants the charge.
- **Objective:** Ember wins by eliminating Vanguard, or by planting the
  charge and letting it detonate (35 s). Vanguard wins by elimination, by
  defusing (hold E in the site, 5 s), or by holding the sites until time.
- **Economy + buy menu:** $800 start, $300 per kill, $325 round win,
  $1,400 round loss, $300 defuse. P9 Sidearm (free), VEX-9 SMG ($1,500),
  AR-77 Rifle ($2,700), Frag Grenade ($300, max 2).
- **Bots:** waypoint-graph AI that holds sites, pushes lanes, plants and
  defuses, with real line-of-sight perception, a facing cone, reaction
  delays, burst fire and distance-based accuracy. At most two bots focus
  the player from range.
- **Gunplay:** hitscan with headshots (up to 4x), recoil and spread that
  punish firing on the move, crouch / sprint / jump, AABB collision.
- **HUD:** health, ammo, money, round timer, team scores, kill feed,
  minimap (walls, sites, teammates, spotted foes, blinking charge),
  plant/defuse progress, damage vignette, round banners.
- **Sound:** synthesised WebAudio effects only — no audio files, no network.
- **Deterministic captures:** `?shot=start|play|plant|end&seed=N` renders a
  frozen frame and sets `window.__shotReady`. `window.__ember` is a small
  test handle (snapshot, fixed steps, teleport, buy, keys) used by the
  headless play-tests in `/tmp/ember-playtest.mjs` and
  `/tmp/ember-planttest.mjs`.

## Play it

```
node serve.ts        # game/ on http://localhost:8080
```

WASD move, Shift sprint, Space jump, Ctrl crouch, mouse look (click to
lock), click fire, R reload, 1/2/3 weapons, G frag, E defuse (hold, in
site). Esc pauses.

## Hand it in

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` + `screenshots/` to the output directory and
writes `dossier.json` with the vendored make.fun library. Two runs are
byte-identical (verified with `diff -r`).

## Verification (17 Nov 2026)

- `node main.ts` 2x to `out/` and `out2/`: `diff -r` identical.
- `game/` 2,240,517 bytes, 21 entries (caps 48 MiB / 993); `index.html`
  12,870 bytes (cap 1 MiB); dossier 312,792 bytes (cap 1.5 MiB);
  dossier text 106,972 bytes (cap 163,840, all 14 source files in full,
  nothing cut).
- three.js files byte-identical to the kit (sha256 matches kit.json).
- No `http://` / `https://`, no fetch/XHR/WebSocket/dynamic import in
  `game/` outside the vendored three.js files.
- 4 screenshots (1280x720 JPEG, 32–43 KiB each, cap 256 KiB), real renders,
  inspected visually; no console errors.
- Headless end-to-end play-test passed: menu → buy (rifle correctly
  refused on $800, grenade bought) → live → 4 shots killed a bot →
  round ended → round 2 buy. Plant/defuse test passed: forced plant at
  Site A → player defused in 5 s → Vanguard won 1–0; grenade bought,
  thrown and detonated in round 2.

## Known blocker (not a code issue)

`node cli/makefun.mjs init` fails: the make.fun API answers 404
`no competition threejs-fps-01` for the competition, its requirements and
its kit download, and the live competition list carries only
`threejs-fps-02`. No anchor line could be obtained, so the transcript
gate's `thinking_fresh` check cannot be satisfied from this session; per
RULES.txt it then skips as a note and the entry is not rejected. The
build is complete and verified; submission waits on the competition
reappearing (or a parent decision).
