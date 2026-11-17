# emberyard

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/cryptocollectorid/emberyard/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/cryptocollectorid/emberyard/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

Emberyard is a complete round-based tactical FPS in the style Counter-Strike made famous, with an original map, art, sounds and names. No network requests; everything is static files under `game/` plus three.js 0.187.0 vendored under `game/vendor/`.

- **Rustyard**, a 64 x 48 m industrial depot: two plant sites (Silo west, Crane east), three lanes, crates, containers, silos and a gantry crane.
- **5v5, first to 5 (max 9 rounds), 100 s rounds, 15 s buy phase.** Vanguard (you + 4 bots) defends; Ember (5 bots) attacks and plants the charge.
- **Objective:** Ember wins by eliminating Vanguard, or by planting the charge and letting it detonate (35 s). Vanguard wins by elimination, by defusing (hold E in the site, 5 s), or by holding the sites until time.
- **Economy + buy menu:** $800 start, $300 per kill, $325 round win, $1,400 round loss, $300 defuse. P9 Sidearm (free), VEX-9 SMG ($1,500), AR-77 Rifle ($2,700), Frag Grenade ($300, max 2).
- **Bots:** waypoint-graph AI that holds sites, pushes lanes, plants and defuses, with real line-of-sight perception, a facing cone, reaction delays, burst fire and distance-based accuracy. At most two bots focus the player from range.
- **Gunplay:** hitscan with headshots (up to 4x), recoil and spread that punish firing on the move, crouch / sprint / jump, AABB collision.
- **HUD:** health, ammo, money, round timer, team scores, kill feed, minimap (walls, sites, teammates, spotted foes, blinking charge), plant/defuse progress, damage vignette, round banners.
- **Sound:** synthesised WebAudio effects only — no audio files, no network.
- **Deterministic captures:** `?shot=start|play|plant|end&seed=N` renders a frozen frame and sets `window.__shotReady`. `window.__ember` is a small test handle (snapshot, fixed steps, teleport, buy, keys).

WASD move, Shift sprint, Space jump, Ctrl crouch, mouse look (click to lock), click fire, R reload, 1/2/3 weapons, G frag, E defuse (hold, in site). Esc pauses.

Entry for make.fun `best-game-01`: "Make the best game". Originally built for `threejs-fps-01`; adapted for best-game-01 by swapping the vendored make.fun library (`vendor/makefun-threejs.ts` → `vendor/makefun-game.ts`).

## Run it

```sh
node serve.ts        # game/ on http://localhost:8080
```

Then open http://localhost:8080 in desktop Chrome.

---

<sub>Entered on [make.fun](https://make.fun/?ref=4pc5tnqn&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
