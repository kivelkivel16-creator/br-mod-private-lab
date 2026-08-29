// BR MOD core v4 — owner-authorized private test environment only.
// Movement changes apply only to selected local player/vehicle object.

var BR4_ROOT = "/sdcard/Android/data/com.br.top/files/";
var BR4_CFG = BR4_ROOT + "br_cfg.txt";
var BR4_LOG = BR4_ROOT + "br_log.txt";
var BR4_STATUS = BR4_ROOT + "br_status.txt";

function br4Log(message) {
    try {
        var f = new File(BR4_LOG, "a");
        f.write("[core-v4] " + message + "\n");
        f.flush();
        f.close();
    } catch (_) {}
}

if (globalThis.__brCoreV4) {
    br4Log("reload ignored: core already active");
} else {
    var rt = {
        armed: false,
        target: null,
        speed: 1.0,
        jump: 1.0,
        safeFall: false,
        antiAfk: false,
        gameHud: true,
        actionSeq: null,
        pendingAction: null,
        touchNative: null,
        hudNative: null,
        hudApplied: null,
        synthetic: false,
        lastTouchMs: Date.now(),
        lastPulseMs: 0,
        lastJoyCenter: { x: 365, y: 690 },
        coords: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 }
        ],
        joystick: [
            { active: false, cx: 0, cy: 0 },
            { active: false, cx: 0, cy: 0 },
            { active: false, cx: 0, cy: 0 }
        ],
        motion: {
            key: null,
            last: null,
            lastAt: 0,
            lastDir: null,
            writes: 0,
            resets: 0,
            errors: 0
        },
        fpsFrames: 0,
        fps: 0,
        fpsHooked: false,
        touchCalls: 0,
        smoothedCalls: 0
    };
    globalThis.__brCoreV4 = rt;

    function readText(path, max) {
        try {
            var f = new File(path, "r");
            var value = f.readText(max) || "";
            f.close();
            return value;
        } catch (_) { return ""; }
    }

    function cfgValue(text, name, fallback) {
        var match = new RegExp("^" + name + "\\s*=\\s*([^\\r\\n]+)", "m").exec(text);
        return match === null ? fallback : match[1].trim();
    }

    function allowedFactor(value) {
        return value === 1.0 || value === 1.5 || value === 2.0 || value === 3.0;
    }

    function queueAction(name) {
        if (name === "up") rt.pendingAction = { step: 0.28, left: 24 };
        else if (name === "down") rt.pendingAction = { step: -0.22, left: 18 };
        if (rt.pendingAction !== null) br4Log("self action queued: " + name);
    }

    function readConfig() {
        var text = readText(BR4_CFG, 4096);
        if (text.length === 0) return;
        var nextSpeed = parseFloat(cfgValue(text, "speed", "1.0"));
        var nextJump = parseFloat(cfgValue(text, "jump", "1.0"));
        if (!allowedFactor(nextSpeed)) nextSpeed = 1.0;
        if (!allowedFactor(nextJump)) nextJump = 1.0;
        var nextSafeFall = cfgValue(text, "safefall", "0") === "1";
        var nextAfk = cfgValue(text, "antiafk", "0") === "1";
        var nextHud = cfgValue(text, "gamehud", cfgValue(text, "draw2d", "1")) === "1";
        var nextSeq = parseInt(cfgValue(text, "action_seq", "0"), 10);
        if (!isFinite(nextSeq)) nextSeq = 0;
        var changed = nextSpeed !== rt.speed || nextJump !== rt.jump ||
            nextSafeFall !== rt.safeFall || nextAfk !== rt.antiAfk || nextHud !== rt.gameHud;
        rt.speed = nextSpeed;
        rt.jump = nextJump;
        rt.safeFall = nextSafeFall;
        rt.antiAfk = nextAfk;
        rt.gameHud = nextHud;
        if (rt.actionSeq === null) rt.actionSeq = nextSeq;
        else if (nextSeq !== rt.actionSeq) {
            rt.actionSeq = nextSeq;
            queueAction(cfgValue(text, "action", "none"));
        }
        if (changed) {
            br4Log("cfg localSpeed=" + rt.speed.toFixed(1) + " jump=" + rt.jump.toFixed(1) +
                " safeFall=" + rt.safeFall + " antiafk=" + rt.antiAfk + " hud=" + rt.gameHud);
        }
    }

    function finiteCoord(value) { return isFinite(value) && Math.abs(value) < 100000.0; }

    function selectedEntity() {
        if (rt.target === null) return null;
        try {
            var holder = rt.target.base.add(0x19d9920).readPointer();
            if (holder.isNull()) return null;
            var index = holder.readU16();
            if (index > 4095) return null;
            var wrapper = rt.target.base.add(0x2b2f120 + index * 0xf8).readPointer();
            if (wrapper.isNull()) return null;
            var attached = wrapper.add(0x500).readPointer();
            var inVehicle = wrapper.add(0x508).readU8() !== 0 && !attached.isNull();
            var entity = inVehicle ? attached : wrapper;
            var x = entity.add(0x38).readFloat();
            var y = entity.add(0x3c).readFloat();
            var z = entity.add(0x40).readFloat();
            if (!finiteCoord(x) || !finiteCoord(y) || !finiteCoord(z)) return null;
            return { ptr: entity, key: entity.toString() + ":" + (inVehicle ? "v" : "p"),
                x: x, y: y, z: z, vehicle: inVehicle };
        } catch (_) { return null; }
    }

    function resetMotion(entity, now) {
        rt.motion.key = entity === null ? null : entity.key;
        rt.motion.last = entity === null ? null : { x: entity.x, y: entity.y, z: entity.z };
        rt.motion.lastAt = now;
        rt.motion.lastDir = null;
        rt.motion.resets++;
    }

    function movementTick() {
        if (!rt.armed) return;
        var now = Date.now();
        var active = rt.pendingAction !== null;
        if (!active) {
            rt.motion.key = null;
            rt.motion.last = null;
            rt.motion.lastAt = now;
            rt.motion.lastDir = null;
            return;
        }
        var entity = selectedEntity();
        if (entity === null) {
            if (rt.motion.key !== null) resetMotion(null, now);
            return;
        }
        if (rt.motion.key !== entity.key || rt.motion.last === null ||
                now - rt.motion.lastAt <= 0 || now - rt.motion.lastAt > 160) {
            resetMotion(entity, now);
            return;
        }

        var dt = now - rt.motion.lastAt;
        var dx = entity.x - rt.motion.last.x;
        var dy = entity.y - rt.motion.last.y;
        var dz = entity.z - rt.motion.last.z;
        var horizontal = Math.sqrt(dx * dx + dy * dy);
        var maxNatural = entity.vehicle ? 1.5 + dt * 0.085 : 0.45 + dt * 0.030;
        if (horizontal > maxNatural || Math.abs(dz) > maxNatural * 1.5) {
            resetMotion(entity, now);
            return;
        }

        var outX = entity.x;
        var outY = entity.y;
        var outZ = entity.z;
        if (rt.pendingAction !== null) {
            outZ += rt.pendingAction.step;
            rt.pendingAction.left--;
            if (rt.pendingAction.left <= 0) rt.pendingAction = null;
        }

        try {
            if (outX !== entity.x) entity.ptr.add(0x38).writeFloat(outX);
            if (outY !== entity.y) entity.ptr.add(0x3c).writeFloat(outY);
            if (outZ !== entity.z) entity.ptr.add(0x40).writeFloat(outZ);
            if (outX !== entity.x || outY !== entity.y || outZ !== entity.z) rt.motion.writes++;
            rt.motion.last = { x: outX, y: outY, z: outZ };
            rt.motion.lastAt = now;
        } catch (error) {
            rt.motion.errors++;
            resetMotion(entity, now);
            br4Log("movement write error: " + error);
        }
    }

    function intArg(value) { return ptr((value | 0) >>> 0); }
    function coord(args, id, axis) { return args[4 + id * 2 + axis].toInt32(); }
    function isJoystickPoint(x, y) { return x >= 40 && x <= 550 && y >= 520 && y <= 850; }

    function minimumGain() {
        if (rt.speed >= 3.0) return 0.34;
        if (rt.speed >= 2.0) return 0.50;
        if (rt.speed >= 1.5) return 0.70;
        return 1.0;
    }

    function softenHorizontal(x, centerX) {
        var dx = x - centerX;
        var radius = 180.0;
        var magnitude = Math.abs(dx);
        if (magnitude < 2 || magnitude >= radius) return x;
        var n = magnitude / radius;
        var gain = minimumGain();
        var shaped = radius * (gain * n + (1.0 - gain) * n * n * n);
        return Math.round(centerX + (dx < 0 ? -shaped : shaped));
    }

    function attachTouch() {
        var symbol = rt.target.findExportByName("Java_com_blackhub_bronline_game_core_JNILib_multiTouchEvent");
        if (symbol === null) { br4Log("multiTouchEvent export not found"); return; }
        rt.touchNative = new NativeFunction(symbol, "void", [
            "pointer", "pointer", "int", "int", "int", "int", "int", "int", "int", "int"
        ]);
        Interceptor.attach(symbol, {
            onEnter: function (args) {
                if (rt.synthetic) return;
                rt.touchCalls++;
                rt.lastTouchMs = Date.now();
                var action = args[2].toInt32();
                var pointerId = args[3].toInt32();
                for (var c = 0; c < 3; c++) {
                    rt.coords[c].x = coord(args, c, 0);
                    rt.coords[c].y = coord(args, c, 1);
                }
                if (pointerId < 0 || pointerId > 2) return;
                if (action === 0 || action === 5) {
                    var downX = rt.coords[pointerId].x;
                    var downY = rt.coords[pointerId].y;
                    var state = rt.joystick[pointerId];
                    state.active = isJoystickPoint(downX, downY);
                    state.cx = downX;
                    state.cy = downY;
                    if (state.active) rt.lastJoyCenter = { x: downX, y: downY };
                }
                if (rt.speed > 1.0) {
                    for (var id = 0; id < 3; id++) {
                        var joy = rt.joystick[id];
                        if (!joy.active) continue;
                        var originalX = coord(args, id, 0);
                        var softenedX = softenHorizontal(originalX, joy.cx);
                        if (softenedX !== originalX) {
                            args[4 + id * 2] = intArg(softenedX);
                            rt.smoothedCalls++;
                        }
                    }
                }
                if (action === 1 || action === 3 || action === 6) rt.joystick[pointerId].active = false;
            }
        });
        br4Log("touch hook armed at " + symbol);
    }

    function callSynthetic(action, id, x, y) {
        if (rt.touchNative === null) return;
        rt.coords[id].x = x;
        rt.coords[id].y = y;
        rt.synthetic = true;
        try {
            rt.touchNative(NULL, NULL, action, id,
                rt.coords[0].x, rt.coords[0].y,
                rt.coords[1].x, rt.coords[1].y,
                rt.coords[2].x, rt.coords[2].y);
        } finally { rt.synthetic = false; }
    }

    function antiAfkTick() {
        if (!rt.antiAfk || rt.touchNative === null) return;
        var now = Date.now();
        if (now - rt.lastTouchMs < 30000 || now - rt.lastPulseMs < 30000) return;
        rt.lastPulseMs = now;
        var c = rt.lastJoyCenter;
        callSynthetic(0, 0, c.x, c.y);
        setTimeout(function () { callSynthetic(2, 0, c.x, c.y - 40); }, 90);
        setTimeout(function () { callSynthetic(2, 0, c.x, c.y); }, 180);
        setTimeout(function () { callSynthetic(1, 0, c.x, c.y); }, 260);
        br4Log("anti-afk pulse");
    }

    function attachHudSwitch() {
        var hp = rt.target.findExportByName("Java_com_blackhub_bronline_game_core_JNILib_toggleDrawing2dStuff");
        if (hp !== null) rt.hudNative = new NativeFunction(hp, "void", ["pointer", "pointer", "int"]);
        br4Log("native HUD switch=" + (rt.hudNative !== null));
    }

    function syncHudSwitch() {
        try {
            if (rt.hudNative !== null && rt.hudApplied !== rt.gameHud) {
                rt.hudNative(NULL, NULL, rt.gameHud ? 0 : 1);
                rt.hudApplied = rt.gameHud;
            }
        } catch (error) { br4Log("HUD switch error: " + error); }
    }

    function tryAttachFps() {
        if (rt.fpsHooked) return;
        var egl = Process.findModuleByName("libEGL.so");
        if (egl === null) return;
        var swap = egl.findExportByName("eglSwapBuffers");
        if (swap === null) return;
        Interceptor.attach(swap, { onEnter: function () { rt.fpsFrames++; } });
        rt.fpsHooked = true;
        br4Log("fps hook armed");
    }

    function writeStatus() {
        var needsEntity = rt.pendingAction !== null;
        var entity = needsEntity ? selectedEntity() : null;
        var place = entity === null ? "ПОЗИЦИЯ НЕДОСТУПНА" :
            (entity.vehicle ? "В МАШИНЕ" : "ПЕШКОМ") + " | ПОЗИЦИЯ " +
            entity.x.toFixed(1) + " " + entity.y.toFixed(1) + " " + entity.z.toFixed(1);
        var line1 = "FPS — | " + place;
        var line2 = "СКОРОСТЬ x" + rt.speed.toFixed(1) + " | ПРЫЖОК x" + rt.jump.toFixed(1) +
            " | ПАДЕНИЕ " + (rt.safeFall ? "ВКЛ" : "ВЫКЛ");
        var line3 = "AFK " + (rt.antiAfk ? "ВКЛ" : "ВЫКЛ") + " | ЛОКАЛЬНЫХ ЗАПИСЕЙ " + rt.motion.writes +
            " | ЯДРО " + (rt.armed ? "ГОТОВО" : "ОЖИДАНИЕ");
        try {
            var f = new File(BR4_STATUS, "w");
            f.write(line1 + "\n" + line2 + "\n" + line3 + "\n");
            f.flush();
            f.close();
        } catch (_) {}
        rt.motion.writes = 0;
    }

    function tryArm() {
        if (rt.armed) return;
        var target = Process.findModuleByName("libblackrussia-client.so");
        if (target === null) return;
        rt.target = target;
        attachTouch();
        attachHudSwitch();
        rt.armed = true;
        syncHudSwitch();
        br4Log("armed local-only target=" + target.base + " size=" + target.size);
    }

    setInterval(readConfig, 500);
    setInterval(function () { tryArm(); syncHudSwitch(); }, 500);
    setInterval(movementTick, 16);
    setInterval(antiAfkTick, 1000);
    setInterval(writeStatus, 1000);
    readConfig();
    tryArm();
    writeStatus();
    br4Log("loader active; no global clock hook");
}

// v4-signature-20260828-local-motion-a
