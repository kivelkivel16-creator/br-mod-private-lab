// BR MOD core v3 — authorized private test environment only.
// All game-affecting switches are local client mechanisms. Packet hooks are read-only.

var BR_ROOT = "/sdcard/Android/data/com.br.top/files/";
var BR_CFG = BR_ROOT + "br_cfg.txt";
var BR_LOG = BR_ROOT + "br_log.txt";
var BR_STATUS = BR_ROOT + "br_status.txt";

function br3Log(message) {
    try {
        var f = new File(BR_LOG, "a");
        f.write("[core-v3] " + message + "\n");
        f.flush();
        f.close();
    } catch (_) {}
}

if (globalThis.__brCoreV3) {
    br3Log("reload ignored: core already active");
} else {
    var rt = {
        armed: false,
        target: null,
        speed: 1.0,
        autoRun: false,
        antiAfk: false,
        gameHud: true,
        blur: false,
        debug: false,
        clocks: {},
        touchNative: null,
        hudNative: null,
        blurNative: null,
        hudApplied: null,
        blurApplied: null,
        autoRunHeld: false,
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
        fpsFrames: 0,
        fps: 0,
        fpsHooked: false,
        scaledCalls: 0,
        touchCalls: 0,
        smoothedCalls: 0,
        packet76: 0,
        packet81: 0,
        lastPacketPosition: null
    };
    globalThis.__brCoreV3 = rt;

    function readText(path, max) {
        try {
            var f = new File(path, "r");
            var text = f.readText(max) || "";
            f.close();
            return text;
        } catch (_) { return ""; }
    }

    function cfgValue(text, name, fallback) {
        var match = new RegExp("^" + name + "\\s*=\\s*([^\\r\\n]+)", "m").exec(text);
        return match === null ? fallback : match[1].trim();
    }

    function readConfig() {
        var text = readText(BR_CFG, 4096);
        if (text.length === 0) return;
        var nextSpeed = parseFloat(cfgValue(text, "speed", "1.0"));
        if (nextSpeed !== 1.0 && nextSpeed !== 1.5 && nextSpeed !== 2.0 && nextSpeed !== 3.0) nextSpeed = 1.0;
        var nextRun = cfgValue(text, "autorun", "0") === "1";
        var nextAfk = cfgValue(text, "antiafk", "0") === "1";
        var nextHud = cfgValue(text, "gamehud", cfgValue(text, "draw2d", "1")) === "1";
        var nextBlur = cfgValue(text, "blur", cfgValue(text, "bloor", "0")) === "1";
        var nextDebug = cfgValue(text, "debug", "0") === "1";
        var changed = nextSpeed !== rt.speed || nextRun !== rt.autoRun || nextAfk !== rt.antiAfk ||
            nextHud !== rt.gameHud || nextBlur !== rt.blur || nextDebug !== rt.debug;
        rt.speed = nextSpeed;
        rt.autoRun = nextRun;
        rt.antiAfk = nextAfk;
        rt.gameHud = nextHud;
        rt.blur = nextBlur;
        rt.debug = nextDebug;
        if (changed) {
            br3Log("cfg speed=" + rt.speed.toFixed(1) + " autorun=" + rt.autoRun +
                " antiafk=" + rt.antiAfk + " hud=" + rt.gameHud +
                " blur=" + rt.blur + " debug=" + rt.debug);
        }
    }

    function isInsideTarget(address) {
        return rt.target !== null && address.compare(rt.target.base) >= 0 &&
            address.compare(rt.target.base.add(rt.target.size)) < 0;
    }

    function scaleTimespec(clockId, ptrTimespec) {
        var sec = ptrTimespec.readS64().toNumber();
        var nsec = ptrTimespec.add(8).readS64().toNumber();
        var realNs = sec * 1000000000 + nsec;
        var key = String(clockId);
        var state = rt.clocks[key];
        if (state === undefined) {
            rt.clocks[key] = { real: realNs, virtual: realNs };
            return;
        }
        var delta = realNs - state.real;
        if (delta < 0 || delta > 5000000000) {
            state.real = realNs;
            state.virtual = realNs;
            return;
        }
        state.real = realNs;
        state.virtual += delta * rt.speed;
        var outSec = Math.floor(state.virtual / 1000000000);
        var outNsec = Math.floor(state.virtual - outSec * 1000000000);
        ptrTimespec.writeS64(outSec);
        ptrTimespec.add(8).writeS64(outNsec);
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
        if (symbol === null) { br3Log("multiTouchEvent export not found"); return; }
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
                // Steering assistance is inseparable from speed and automatically scales with it.
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
        br3Log("touch hook armed at " + symbol);
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

    function startAutoRun() {
        if (rt.autoRunHeld || rt.touchNative === null) return;
        var c = rt.lastJoyCenter;
        callSynthetic(0, 0, c.x, c.y);
        callSynthetic(2, 0, c.x, Math.max(450, c.y - 170));
        rt.autoRunHeld = true;
        br3Log("auto-run hold start center=" + c.x + "," + c.y);
    }

    function stopAutoRun() {
        if (!rt.autoRunHeld || rt.touchNative === null) return;
        var c = rt.lastJoyCenter;
        callSynthetic(1, 0, c.x, c.y);
        rt.autoRunHeld = false;
        br3Log("auto-run hold stop");
    }

    function autoRunTick() {
        if (rt.autoRun) {
            startAutoRun();
            if (rt.autoRunHeld) {
                var c = rt.lastJoyCenter;
                callSynthetic(2, 0, c.x, Math.max(450, c.y - 170));
            }
        } else stopAutoRun();
    }

    function antiAfkTick() {
        if (!rt.antiAfk || rt.autoRun || rt.touchNative === null) return;
        var now = Date.now();
        if (now - rt.lastTouchMs < 30000 || now - rt.lastPulseMs < 30000) return;
        rt.lastPulseMs = now;
        var c = rt.lastJoyCenter;
        callSynthetic(0, 0, c.x, c.y);
        setTimeout(function () { callSynthetic(2, 0, c.x, c.y - 40); }, 90);
        setTimeout(function () { callSynthetic(2, 0, c.x, c.y); }, 180);
        setTimeout(function () { callSynthetic(1, 0, c.x, c.y); }, 260);
        br3Log("anti-afk pulse");
    }

    function attachNativeSwitches() {
        var hp = rt.target.findExportByName("Java_com_blackhub_bronline_game_core_JNILib_toggleDrawing2dStuff");
        var bp = rt.target.findExportByName("Java_com_blackhub_bronline_game_core_JNILib_toggleBloor");
        if (hp !== null) rt.hudNative = new NativeFunction(hp, "void", ["pointer", "pointer", "int"]);
        if (bp !== null) rt.blurNative = new NativeFunction(bp, "void", ["pointer", "pointer", "int"]);
        br3Log("native switches hud=" + (rt.hudNative !== null) + " blur=" + (rt.blurNative !== null));
    }

    function syncNativeSwitches() {
        try {
            if (rt.hudNative !== null && rt.hudApplied !== rt.gameHud) {
                // This native method stores the inverse of its boolean argument.
                rt.hudNative(NULL, NULL, rt.gameHud ? 0 : 1);
                rt.hudApplied = rt.gameHud;
            }
            if (rt.blurNative !== null && rt.blurApplied !== rt.blur) {
                rt.blurNative(NULL, NULL, rt.blur ? 1 : 0);
                rt.blurApplied = rt.blur;
            }
        } catch (error) { br3Log("native switch error: " + error); }
    }

    function finiteCoord(value) { return isFinite(value) && Math.abs(value) < 100000.0; }

    function observePacket(buffer, length) {
        var offsets = null;
        if (length === 76) { offsets = [36, 40, 44]; rt.packet76++; }
        else if (length === 81) { offsets = [16, 20, 24]; rt.packet81++; }
        if (offsets === null) return;
        try {
            var x = buffer.add(offsets[0]).readFloat();
            var y = buffer.add(offsets[1]).readFloat();
            var z = buffer.add(offsets[2]).readFloat();
            if (finiteCoord(x) && finiteCoord(y) && finiteCoord(z)) rt.lastPacketPosition = { x: x, y: y, z: z };
        } catch (_) {}
    }

    function attachPacketObserver(libc) {
        ["sendto", "send"].forEach(function (name) {
            var symbol = libc.findExportByName(name);
            if (symbol === null) return;
            Interceptor.attach(symbol, {
                onEnter: function (args) {
                    if (rt.debug) observePacket(args[1], args[2].toInt32());
                }
            });
        });
    }

    function tryAttachFps() {
        if (rt.fpsHooked) return;
        var egl = Process.findModuleByName("libEGL.so");
        if (egl === null) return;
        var swap = egl.findExportByName("eglSwapBuffers");
        if (swap === null) return;
        Interceptor.attach(swap, { onEnter: function () { rt.fpsFrames++; } });
        rt.fpsHooked = true;
        br3Log("fps hook armed");
    }

    function selectedPosition() {
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
            return { x: x, y: y, z: z, vehicle: inVehicle };
        } catch (_) { return null; }
    }

    function writeStatus() {
        var pos = selectedPosition();
        var place = pos === null ? "POS unavailable" :
            (pos.vehicle ? "VEHICLE" : "ON FOOT") + " | POS " +
            pos.x.toFixed(1) + " " + pos.y.toFixed(1) + " " + pos.z.toFixed(1);
        var line1 = "FPS " + rt.fps + " | " + place;
        var line2 = "SPEED x" + rt.speed.toFixed(1) + (rt.speed > 1.0 ? " AUTO-SMOOTH" : "") +
            " | RUN " + (rt.autoRun ? "ON" : "OFF") + " | AFK " + (rt.antiAfk ? "ON" : "OFF");
        try {
            var f = new File(BR_STATUS, "w");
            f.write(line1 + "\n" + line2 + "\n");
            f.flush();
            f.close();
        } catch (_) {}
        rt.fps = rt.fpsFrames;
        rt.fpsFrames = 0;
    }

    function debugSummary() {
        if (!rt.debug || !rt.armed) return;
        var line = "speed=" + rt.speed.toFixed(1) + " scaled5s=" + rt.scaledCalls +
            " touch5s=" + rt.touchCalls + " smooth5s=" + rt.smoothedCalls +
            " pkt76=" + rt.packet76 + " pkt81=" + rt.packet81;
        if (rt.lastPacketPosition !== null) line += " pktPos=" + rt.lastPacketPosition.x.toFixed(2) + "," +
            rt.lastPacketPosition.y.toFixed(2) + "," + rt.lastPacketPosition.z.toFixed(2);
        br3Log(line);
        rt.scaledCalls = 0;
        rt.touchCalls = 0;
        rt.smoothedCalls = 0;
        rt.packet76 = 0;
        rt.packet81 = 0;
    }

    function tryArm() {
        if (rt.armed) return;
        var target = Process.findModuleByName("libblackrussia-client.so");
        var libc = Process.findModuleByName("libc.so");
        if (target === null || libc === null) return;
        var clockGettime = libc.findExportByName("clock_gettime");
        if (clockGettime === null) { br3Log("clock_gettime export not found"); return; }
        rt.target = target;
        Interceptor.attach(clockGettime, {
            onEnter: function (args) {
                this.clockId = args[0].toInt32();
                this.timespec = args[1];
                this.applyScale = (this.clockId === 1 || this.clockId === 4 || this.clockId === 6) &&
                    isInsideTarget(this.returnAddress);
            },
            onLeave: function (retval) {
                if (!this.applyScale || retval.toInt32() !== 0) return;
                try {
                    scaleTimespec(this.clockId, this.timespec);
                    if (rt.speed !== 1.0) rt.scaledCalls++;
                } catch (error) { br3Log("timespec error: " + error); }
            }
        });
        attachTouch();
        attachNativeSwitches();
        attachPacketObserver(libc);
        tryAttachFps();
        rt.armed = true;
        syncNativeSwitches();
        br3Log("armed target=" + target.base + " size=" + target.size);
    }

    setInterval(readConfig, 250);
    setInterval(function () { tryArm(); tryAttachFps(); syncNativeSwitches(); }, 500);
    setInterval(autoRunTick, 250);
    setInterval(antiAfkTick, 1000);
    setInterval(writeStatus, 1000);
    setInterval(debugSummary, 5000);
    readConfig();
    tryArm();
    writeStatus();
    br3Log("loader active");
}

// v3-signature-20260827-final-b
