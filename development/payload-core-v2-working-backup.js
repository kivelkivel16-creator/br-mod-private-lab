// BR MOD core v2 — authorized private test environment only.
// Speed remains clock based; steering assist reshapes only small horizontal
// joystick deflections. DEBUG observes outgoing position packets without edits.

var ROOT = "/sdcard/Android/data/com.br.top/files/";
var CFG = ROOT + "br_cfg.txt";
var LOGF = ROOT + "br_log.txt";

function brLog(message) {
    try {
        var f = new File(LOGF, "a");
        f.write("[core-v2] " + message + "\n");
        f.flush();
        f.close();
    } catch (_) {}
}

if (globalThis.__brCoreV2) {
    brLog("reload ignored: core already active");
} else {
    var runtime = {
        armed: false,
        speed: 1.0,
        steer: true,
        antiafk: false,
        debug: false,
        target: null,
        clocks: {},
        totalCalls: 0,
        scaledCalls: 0,
        touchCalls: 0,
        smoothedCalls: 0,
        packet76: 0,
        packet81: 0,
        lastPosition: null,
        lastTouchMs: Date.now(),
        lastPulseMs: 0,
        synthetic: false,
        touchNative: null,
        joystick: [
            { active: false, cx: 0, cy: 0 },
            { active: false, cx: 0, cy: 0 },
            { active: false, cx: 0, cy: 0 }
        ]
    };
    globalThis.__brCoreV2 = runtime;

    function readText(path, max) {
        try {
            var f = new File(path, "r");
            var text = f.readText(max) || "";
            f.close();
            return text;
        } catch (_) {
            return "";
        }
    }

    function cfgValue(text, name, fallback) {
        var rx = new RegExp("^" + name + "\\s*=\\s*([^\\r\\n]+)", "m");
        var match = rx.exec(text);
        return match === null ? fallback : match[1].trim();
    }

    function readConfig() {
        var text = readText(CFG, 4096);
        if (text.length === 0) return;
        var nextSpeed = parseFloat(cfgValue(text, "speed", "1.0"));
        if (nextSpeed !== 1.0 && nextSpeed !== 1.5 && nextSpeed !== 2.0 && nextSpeed !== 3.0) {
            nextSpeed = 1.0;
        }
        var nextSteer = cfgValue(text, "steer", "1") === "1";
        var nextAfk = cfgValue(text, "antiafk", "0") === "1";
        var nextDebug = cfgValue(text, "debug", "0") === "1";
        if (nextSpeed !== runtime.speed || nextSteer !== runtime.steer ||
                nextAfk !== runtime.antiafk || nextDebug !== runtime.debug) {
            brLog("cfg speed=" + nextSpeed.toFixed(1) +
                " steer=" + nextSteer + " antiafk=" + nextAfk + " debug=" + nextDebug);
        }
        runtime.speed = nextSpeed;
        runtime.steer = nextSteer;
        runtime.antiafk = nextAfk;
        runtime.debug = nextDebug;
    }

    function isInsideTarget(address) {
        return runtime.target !== null &&
            address.compare(runtime.target.base) >= 0 &&
            address.compare(runtime.target.base.add(runtime.target.size)) < 0;
    }

    function scaleTimespec(clockId, ptrTimespec) {
        var sec = ptrTimespec.readS64().toNumber();
        var nsec = ptrTimespec.add(8).readS64().toNumber();
        var realNs = sec * 1000000000 + nsec;
        var key = String(clockId);
        var state = runtime.clocks[key];
        if (state === undefined) {
            runtime.clocks[key] = { real: realNs, virtual: realNs };
            return;
        }
        var delta = realNs - state.real;
        if (delta < 0 || delta > 5000000000) {
            state.real = realNs;
            state.virtual = realNs;
            return;
        }
        state.real = realNs;
        state.virtual += delta * runtime.speed;
        var outSec = Math.floor(state.virtual / 1000000000);
        var outNsec = Math.floor(state.virtual - outSec * 1000000000);
        ptrTimespec.writeS64(outSec);
        ptrTimespec.add(8).writeS64(outNsec);
    }

    function intArg(value) {
        return ptr((value | 0) >>> 0);
    }

    function coord(args, pointerId, axis) {
        return args[4 + pointerId * 2 + axis].toInt32();
    }

    function isJoystickPoint(x, y) {
        return x >= 40 && x <= 850 && y >= 430 && y <= 1050;
    }

    function minimumGain() {
        if (runtime.speed >= 3.0) return 0.34;
        if (runtime.speed >= 2.0) return 0.50;
        if (runtime.speed >= 1.5) return 0.70;
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

    function attachTouch(target) {
        var symbol = target.findExportByName(
            "Java_com_blackhub_bronline_game_core_JNILib_multiTouchEvent");
        if (symbol === null) {
            brLog("multiTouchEvent export not found");
            return;
        }
        runtime.touchNative = new NativeFunction(symbol, "void", [
            "pointer", "pointer", "int", "int", "int", "int",
            "int", "int", "int", "int"
        ]);
        Interceptor.attach(symbol, {
            onEnter: function (args) {
                if (runtime.synthetic) return;
                runtime.touchCalls++;
                runtime.lastTouchMs = Date.now();
                var action = args[2].toInt32();
                var pointerId = args[3].toInt32();
                if (pointerId < 0 || pointerId > 2) return;
                if (action === 0 || action === 5) {
                    var downX = coord(args, pointerId, 0);
                    var downY = coord(args, pointerId, 1);
                    var state = runtime.joystick[pointerId];
                    state.active = isJoystickPoint(downX, downY);
                    state.cx = downX;
                    state.cy = downY;
                }
                if (runtime.steer && runtime.speed > 1.0) {
                    for (var id = 0; id < 3; id++) {
                        var joy = runtime.joystick[id];
                        if (!joy.active) continue;
                        var originalX = coord(args, id, 0);
                        var softenedX = softenHorizontal(originalX, joy.cx);
                        if (softenedX !== originalX) {
                            args[4 + id * 2] = intArg(softenedX);
                            runtime.smoothedCalls++;
                        }
                    }
                }
                if (action === 1 || action === 3 || action === 6) {
                    runtime.joystick[pointerId].active = false;
                }
            }
        });
        brLog("touch steering hook armed at " + symbol);
    }

    function finiteCoord(value) {
        return isFinite(value) && Math.abs(value) < 100000.0;
    }

    function observePacket(buffer, length) {
        var offsets = null;
        if (length === 76) {
            offsets = [36, 40, 44];
            runtime.packet76++;
        } else if (length === 81) {
            offsets = [16, 20, 24];
            runtime.packet81++;
        }
        if (offsets === null) return;
        try {
            var x = buffer.add(offsets[0]).readFloat();
            var y = buffer.add(offsets[1]).readFloat();
            var z = buffer.add(offsets[2]).readFloat();
            if (finiteCoord(x) && finiteCoord(y) && finiteCoord(z)) {
                runtime.lastPosition = { length: length, x: x, y: y, z: z };
            }
        } catch (_) {}
    }

    function attachPacketObserver(libc) {
        ["sendto", "send"].forEach(function (name) {
            var symbol = libc.findExportByName(name);
            if (symbol === null) return;
            Interceptor.attach(symbol, {
                onEnter: function (args) {
                    if (!runtime.debug) return;
                    observePacket(args[1], args[2].toInt32());
                }
            });
        });
    }

    function callSynthetic(action, x, y) {
        if (runtime.touchNative === null) return;
        runtime.synthetic = true;
        try {
            runtime.touchNative(NULL, NULL, action, 0, x, y, 0, 0, 0, 0);
        } finally {
            runtime.synthetic = false;
        }
    }

    function antiAfkTick() {
        if (!runtime.antiafk || runtime.touchNative === null) return;
        var now = Date.now();
        if (now - runtime.lastTouchMs < 30000 || now - runtime.lastPulseMs < 30000) return;
        runtime.lastPulseMs = now;
        callSynthetic(0, 365, 690);
        setTimeout(function () { callSynthetic(2, 365, 650); }, 90);
        setTimeout(function () { callSynthetic(2, 365, 690); }, 180);
        setTimeout(function () { callSynthetic(1, 365, 690); }, 260);
        brLog("anti-afk pulse");
    }

    function tryArm() {
        if (runtime.armed) return;
        var target = Process.findModuleByName("libblackrussia-client.so");
        var libc = Process.findModuleByName("libc.so");
        if (target === null || libc === null) return;
        var clockGettime = libc.findExportByName("clock_gettime");
        if (clockGettime === null) {
            brLog("clock_gettime export not found");
            return;
        }
        runtime.target = target;
        Interceptor.attach(clockGettime, {
            onEnter: function (args) {
                runtime.totalCalls++;
                this.clockId = args[0].toInt32();
                this.timespec = args[1];
                this.applyScale = (this.clockId === 1 || this.clockId === 4 || this.clockId === 6) &&
                    isInsideTarget(this.returnAddress);
            },
            onLeave: function (retval) {
                if (!this.applyScale || retval.toInt32() !== 0) return;
                try {
                    scaleTimespec(this.clockId, this.timespec);
                    if (runtime.speed !== 1.0) runtime.scaledCalls++;
                } catch (error) {
                    brLog("timespec error: " + error);
                }
            }
        });
        attachTouch(target);
        attachPacketObserver(libc);
        runtime.armed = true;
        brLog("armed target=" + target.base + " size=" + target.size);
    }

    setInterval(readConfig, 250);
    setInterval(tryArm, 500);
    setInterval(antiAfkTick, 1000);
    setInterval(function () {
        if (!runtime.armed) return;
        var line = "speed=" + runtime.speed.toFixed(1) +
            " scaled5s=" + runtime.scaledCalls +
            " touch5s=" + runtime.touchCalls +
            " smooth5s=" + runtime.smoothedCalls;
        if (runtime.debug) {
            line += " pkt76=" + runtime.packet76 + " pkt81=" + runtime.packet81;
            if (runtime.lastPosition !== null) {
                line += " pos" + runtime.lastPosition.length + "=" +
                    runtime.lastPosition.x.toFixed(2) + "," +
                    runtime.lastPosition.y.toFixed(2) + "," +
                    runtime.lastPosition.z.toFixed(2);
            }
        }
        brLog(line);
        runtime.scaledCalls = 0;
        runtime.totalCalls = 0;
        runtime.touchCalls = 0;
        runtime.smoothedCalls = 0;
        runtime.packet76 = 0;
        runtime.packet81 = 0;
    }, 5000);

    readConfig();
    tryArm();
    brLog("loader active");
}
