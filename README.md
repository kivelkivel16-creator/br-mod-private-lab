# BR Client Security Analysis Lab

**Private research project** for analyzing client-server communication, memory integrity, and runtime instrumentation of a mobile application (custom test server only).  
This repository contains only our own source code, diagnostic instrumentation files, and reports. Original APK, libraries, game assets, device logs, screenshots, keys, or credentials are **not** published.

---

## Current State
- **Active version**: v6.8

### Core Modules
- `development/v4/src/br/mod/DebugOverlay.java` – Android‑side control panel for enabling/disabling instrumentation hooks.
- `development/instrumentation-core-v4.js` – Base runtime instrumentation (UI, touch, event handling).
- `development/instrumentation-core-v5-extra.js` – Extended instrumentation for additional local interactions.
- `development/instrumentation-physics-v6.8.js` – Manipulation of local physics parameters (speed, jump, camera‑based flight, vehicle flight, soft landing, underwater movement) – **all within the client’s own state**.
- `development/instrumentation-v6.8-loader.js` – Current loader script.
- `development/V6.8-RESEARCH-NOTES.md` – Latest parameters and known limitations.
- `development/V5-FUNCTION-MATRIX.md` – Classification of capabilities and project boundaries.

### Execution Chain
App → Frida Gadget → instrumentation-loader.js → instrumentation.js
→ core_v4.js
→ core_v5_extra.js
→ physics_v68.js

text

**Important**:  
Network hooks and server‑side correction suppression are **not** used in this release. All modifications are strictly limited to the **local client state** (the selected character and occupied vehicle). Invincibility, stamina, and water damage handling are to be implemented as separate test‑server flags — server source code is not part of this repository.

---

## Getting Started (for new researchers)
1. Read `development/V6.8-RESEARCH-NOTES.md`.
2. Study the four active JavaScript files and `DebugOverlay.java`.
3. **Do not** attempt to index or reconstruct missing APK or decompiled resources — they are intentionally excluded.
4. After making changes, run `node --check` on every modified JS file.
5. Test each function **one by one**, keeping all toggles **OFF** at startup.
6. **Do not reintroduce** removed network/FPS hot‑loop hooks — they previously degraded performance to 1 FPS.

---

## Local Build & Deployment
- Requirements: JDK 8+, Android SDK (`ANDROID_HOME` or `ANDROID_SDK_ROOT`), Android Build Tools 37.0.0, and 7‑Zip.
- Place your **own authorised base APK** in `inputs/br-mod-base.apk` (the `inputs/` folder is git‑ignored).

**Build & deploy:**
```powershell
.\scripts\build-current.ps1
.\scripts\deploy-current.ps1 -Restart
Update only instrumentation files (no APK reinstall):

powershell
.\scripts\deploy-current.ps1 -SkipInstall -Restart
Repository Policy
This repository must remain private.

Before every push, check git status and git diff --cached.

Never add APK files, memory dumps, keys, logs, or account data — even with git add -f.

Scope & Ethics
This framework is designed exclusively for offline research and educational purposes on a private test server. All operations are performed on the researcher’s own device and do not interact with or affect other users, the live game server, or any third‑party systems. The goal is to improve understanding of client‑side security and resilience against common attack vectors.
