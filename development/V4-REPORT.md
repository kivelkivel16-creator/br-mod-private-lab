# BR MOD 4 — local movement candidate

Date: 2026-08-28. Scope: owner's phone and private Black Russia test server.
No account credentials stored.

## Outcome

- Built and signed `br-mod-v4.apk` for package `com.br.top`, game `16.98.12760`.
- SHA-256: `B71FDBCD1E1D3D36DFCD5D7944A3944FA303666A170068545678265A62CACE5D`.
- Stable v3 APK and payload remain unchanged.
- v4 not installed automatically. `deploy-v4.ps1` performs later one-command install and payload push.

## SPEED change

v3 scaled `clock_gettime` calls originating in `libblackrussia-client.so`. That changed
client time for local simulation and remote interpolation together. Result: local speed
worked, but other players and vehicles appeared to jerk.

v4 removes clock hook completely. New candidate reads only selected local player or
attached local vehicle, amplifies its per-tick horizontal displacement, then writes only
that selected object's coordinates. Steering smoothing remains automatic at x1.5–x3.
Remote entity memory is never selected by this path.

Safety guards:

- writable-memory check before coordinate access;
- pointer/mode reset when entering or leaving vehicle;
- large delta and delayed tick rejection to avoid multiplying teleports/corrections;
- feature reset at x1.0;
- no outgoing packet mutation.

## v4 menu

- `LOCAL SPEED`: x1.0 / x1.5 / x2.0 / x3.0; automatic steering smoothing.
- `JUMP BOOST`: amplifies only positive vertical movement of local on-foot object.
- `SAFE FALL`: reduces local downward displacement; experimental until runtime test.
- `THROW SELF UP` / `PUSH SELF DOWN`: short local vertical action; experimental.
- `ANTI AFK`, `GAME HUD`, `INFO HUD`, `KEEP SCREEN ON` retained.
- `AUTO RUN` removed. It only held synthetic forward joystick input.
- `BLUR FX` removed. It only changed visual blur.
- `DEBUG LOG` removed from main menu. It was developer telemetry, not gameplay function.
- `KEEP SCREEN ON` only prevents display sleep; useful with Anti AFK, otherwise optional.

## Photon static analysis progress

`photon-analysis/HOOK-MAP.md` now maps 41 Photon hook registrations and 41 distinct
replacement candidates from Photon ARM64 relocations. One clear replacement at
`libPhoton.so + 0xc8b4b4` temporarily multiplies a local float at argument `x1 + 0x0c`
by `4.5`, calls original function, then restores value. This confirms Photon uses a
targeted movement hook rather than global clock scaling.

Exact old-client target address is stored in Photon `.bss` and initialized at runtime.
Next Photon runtime trace only needs to dump hook target globals; server login is not
required for initial address collection. Old client offsets still require signature
mapping to current `16.98.12760` client.

## Function difficulty

Ready or low-risk client utilities:

- menu cleanup, Game HUD, Info HUD, Anti AFK, Keep Screen On;
- local movement candidate, jump boost, safe fall, self vertical actions.

Medium; requires one-function runtime traces and current-client signature mapping:

- infinite stamina;
- proper No Freeze and No Fall state hooks;
- high jump via engine velocity rather than coordinate correction;
- no recoil;
- fast brake;
- local vehicle health/fuel display and controlled private-server tests.

Hard or server-authoritative:

- real immortality, invisibility, inventory-backed auto-medkit;
- flight/walking under water without server correction;
- anti-fine/radar, vehicle immortality/fuel, verified firing-rate changes.

Excluded:

- silent aim against players;
- damaging, killing, or throwing other players;
- breaking another player's vehicle;
- administrator impersonation or unauthorized admin actions.

## Manual test order

1. Start at x1.0. Confirm normal on-foot and vehicle movement.
2. Enable x1.5 on foot while another player/vehicle stays visible. Check remote motion.
3. Repeat at x2.0, then in own vehicle. Stop if server rubber-bands local object.
4. Test Jump Boost x1.5 from flat ground.
5. Test Safe Fall from low height only.
6. Test self up/down in open area.

Runtime test must use a clean app restart because existing v3 interceptor cannot be
detached safely from a running process.
