# BR MOD development notes

Current active payload version: **v6.8**. Root `README.md` is canonical setup and
collaboration guide. Installed test build uses this chain:

```text
com.blackhub.bronline.launcher.App.<clinit>
  -> System.loadLibrary("gadget")
  -> libgadget.config.so
  -> /sdcard/Android/data/com.br.top/files/cheat.js
  -> hot-reload eval(payload.js)

App.onCreate
  -> br.mod.BrMenu.init(context)
  -> WindowManager overlay
  -> writes br_cfg.txt
```

`BrMenu` cycles speed through `1.0 -> 1.5 -> 2.0 -> 3.0 -> 1.0`.
Steering softening is automatically tied to selected speed.

Active files:

- `payload-core-v4.js` — optimized local-entity/touch/HUD base.
- `payload-core-v5-extra.js` — extra local movement modes.
- `payload-physics-v6.8.js` — current velocity physics.
- `payload-v6.8-loader.js` — current device loader.
- `v4/src/br/mod/BrMenu.java` — current Russian overlay source.
- `V6.8-REPORT.md` — current behavior and test limits.

Older `payload-*` files remain as diagnostic history. Do not activate
`payload-security-v6.js`: its network interceptors caused severe CPU load and
were removed from current loader. Restart application after replacing loader;
interceptors from previous process remain attached until process exits.
