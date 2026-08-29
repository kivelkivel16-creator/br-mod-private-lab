// BR MOD v6.8 local physics controls for selected player/current vehicle only.
// No frame/network hooks and no anticheat bypass.
(function () {
    if (globalThis.__brPhysicsV68) return;
    var base = globalThis.__brCoreV4;
    if (base === undefined) return;
    var root = "/sdcard/Android/data/com.br.top/files/";
    var cfgPath = root + "br_cfg.txt";
    var logPath = root + "br_log.txt";
    var rt = {
        speed: 1.0,
        jump: 1.0,
        safeFall: false,
        endlessRun: false,
        fly: false,
        waterWalk: false,
        waterDrive: false,
        vehicleCruise: false,
        actionSeq: null,
        brakeUntil: 0,
        landingUntil: 0,
        flightKey: null,
        flightOrigin: null,
        flightLimitLogged: false,
        target: null,
        touchAttached: false,
        active: [false, false, false],
        coords: [{x: 0, y: 0}, {x: 0, y: 0}, {x: 0, y: 0}],
        touchLogs: 0,
        jumpArmed: true,
        cameraLogged: false,
        cameraWarned: false,
        writesVehicle: 0,
        writesPlayer: 0,
        writesVertical: 0,
        errors: 0
    };
    globalThis.__brPhysicsV68 = rt;

    function log(message) {
        try {
            var f = new File(logPath, "a");
            f.write("[physics-v6.8] " + message + "\n");
            f.flush();
            f.close();
        } catch (_) {}
    }

    function cfgValue(text, name, fallback) {
        var match = new RegExp("^" + name + "\\s*=\\s*([^\\r\\n]+)", "m").exec(text);
        return match === null ? fallback : match[1].trim();
    }

    function factor(value) {
        var n = parseFloat(value);
        return n === 1.5 || n === 2.0 || n === 3.0 ? n : 1.0;
    }

    function readConfig() {
        try {
            var f = new File(cfgPath, "r");
            var text = f.readText(4096) || "";
            f.close();
            var oldSpeed = rt.speed;
            var oldFly = rt.fly;
            rt.speed = factor(cfgValue(text, "speed", "1.0"));
            rt.jump = factor(cfgValue(text, "jump", "1.0"));
            rt.safeFall = cfgValue(text, "safefall", "0") === "1";
            rt.endlessRun = cfgValue(text, "endlessrun", "0") === "1";
            rt.fly = cfgValue(text, "fly", "0") === "1";
            rt.waterWalk = cfgValue(text, "waterwalk", "0") === "1";
            rt.waterDrive = cfgValue(text, "waterdrive", "0") === "1";
            rt.vehicleCruise = cfgValue(text, "vehiclecruise", "0") === "1";
            if (oldFly && !rt.fly) rt.landingUntil = Date.now() + 30000;
            if (!rt.fly) {
                rt.flightKey = null;
                rt.flightOrigin = null;
                rt.flightLimitLogged = false;
            }
            var seq = parseInt(cfgValue(text, "action_seq", "0"), 10);
            if (!isFinite(seq)) seq = 0;
            if (rt.actionSeq === null) rt.actionSeq = seq;
            else if (seq !== rt.actionSeq) {
                rt.actionSeq = seq;
                if (cfgValue(text, "action", "none") === "brake") rt.brakeUntil = Date.now() + 320;
            }
            if (oldSpeed !== rt.speed) log("speed-level=" + rt.speed.toFixed(1));
        } catch (_) {}
    }

    function attachTouch() {
        if (rt.touchAttached || base.target === null) return;
        var symbol = base.target.findExportByName("Java_com_blackhub_bronline_game_core_JNILib_multiTouchEvent");
        if (symbol === null) return;
        Interceptor.attach(symbol, {
            onEnter: function (args) {
                var action = args[2].toInt32();
                var id = args[3].toInt32();
                if (id < 0 || id > 2) return;
                for (var i = 0; i < 3; i++) {
                    rt.coords[i].x = args[4 + i * 2].toInt32();
                    rt.coords[i].y = args[5 + i * 2].toInt32();
                }
                if (action === 0 || action === 5) rt.active[id] = true;
                else if (action === 1 || action === 3 || action === 6) rt.active[id] = false;
                if ((action === 0 || action === 5) && rt.touchLogs < 6) {
                    rt.touchLogs++;
                    log("touch id=" + id + " x=" + rt.coords[id].x + " y=" + rt.coords[id].y);
                }
            }
        });
        rt.touchAttached = true;
        log("touch tracker ready");
    }

    function rightHeld() {
        for (var i = 0; i < 3; i++) {
            if (rt.active[i] && rt.coords[i].x >= 650 && rt.coords[i].y >= 300) return true;
        }
        return false;
    }

    function leftHeld() {
        for (var i = 0; i < 3; i++) {
            if (rt.active[i] && rt.coords[i].x < 650 && rt.coords[i].y >= 300) return true;
        }
        return false;
    }

    function selectedEntity() {
        if (base.target === null) return null;
        try {
            var holder = base.target.base.add(0x19d9920).readPointer();
            if (holder.isNull()) return null;
            var index = holder.readU16();
            if (index > 4095) return null;
            var wrapper = base.target.base.add(0x2b2f120 + index * 0xf8).readPointer();
            if (wrapper.isNull()) return null;
            var attached = wrapper.add(0x500).readPointer();
            var vehicle = wrapper.add(0x508).readU8() !== 0 && !attached.isNull();
            var ptrValue = vehicle ? attached : wrapper;
            return { ptr: ptrValue, vehicle: vehicle, key: ptrValue.toString() + (vehicle ? ":v" : ":p") };
        } catch (_) { return null; }
    }

    function vehicleProfile() {
        if (rt.speed <= 1.0) return null;
        if (rt.speed <= 1.5) return { cap: 0.53, step: 0.0027 };
        if (rt.speed <= 2.0) return { cap: 0.58, step: 0.0039 };
        return { cap: 0.63, step: 0.0052 };
    }

    function playerProfile() {
        if (rt.speed <= 1.0) return null;
        if (rt.speed <= 1.5) return { cap: 0.55, step: 0.0060 };
        if (rt.speed <= 2.0) return { cap: 0.72, step: 0.0100 };
        return { cap: 0.92, step: 0.0150 };
    }

    function waterProfile() {
        if (rt.speed <= 1.0) return { cap: 0.18, step: 0.0030 };
        if (rt.speed <= 1.5) return { cap: 0.24, step: 0.0040 };
        if (rt.speed <= 2.0) return { cap: 0.30, step: 0.0050 };
        return { cap: 0.38, step: 0.0060 };
    }

    function accelerate(ptrValue, profile, counter) {
        var vx = ptrValue.add(0x168).readFloat();
        var vy = ptrValue.add(0x16c).readFloat();
        if (!isFinite(vx) || !isFinite(vy) || Math.abs(vx) > 10 || Math.abs(vy) > 10) return;
        var magnitude = Math.sqrt(vx * vx + vy * vy);
        if (magnitude < 0.012 || magnitude >= profile.cap) return;
        var desired = Math.min(profile.cap, magnitude + profile.step);
        var scale = desired / magnitude;
        ptrValue.add(0x168).writeFloat(vx * scale);
        ptrValue.add(0x16c).writeFloat(vy * scale);
        if (counter === "vehicle") rt.writesVehicle++;
        else rt.writesPlayer++;
    }

    function cameraDirection() {
        try {
            // Scene.camera is initialized through *(base + 0x19d9c58), then Scene + 0x8.
            // rw::Camera keeps its Frame in Object.parent (+0x8); Frame.matrix.at is +0x50.
            var scene = base.target.base.add(0x19d9c58).readPointer();
            if (scene.isNull()) return null;
            var camera = scene.add(0x8).readPointer();
            if (camera.isNull()) return null;
            var frame = camera.add(0x8).readPointer();
            if (frame.isNull()) return null;
            var x = frame.add(0x50).readFloat();
            var y = frame.add(0x54).readFloat();
            var z = frame.add(0x58).readFloat();
            if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return null;
            var length = Math.sqrt(x * x + y * y + z * z);
            if (length < 0.70 || length > 1.30) return null;
            if (!rt.cameraLogged) {
                rt.cameraLogged = true;
                log("camera direction ready x=" + x.toFixed(3) + " y=" + y.toFixed(3) + " z=" + z.toFixed(3));
            }
            return { x: x / length, y: y / length, z: z / length };
        } catch (_) { return null; }
    }

    function flightSpeed(vehicle) {
        if (vehicle) {
            if (rt.speed <= 1.0) return 0.28;
            if (rt.speed <= 1.5) return 0.38;
            if (rt.speed <= 2.0) return 0.50;
            return 0.65;
        }
        if (rt.speed <= 1.0) return 0.18;
        if (rt.speed <= 1.5) return 0.24;
        if (rt.speed <= 2.0) return 0.32;
        return 0.44;
    }

    function flightScale(entity) {
        if (rt.flightKey !== entity.key || rt.flightOrigin === null) {
            rt.flightKey = entity.key;
            rt.flightOrigin = {
                x: entity.ptr.add(0x38).readFloat(),
                y: entity.ptr.add(0x3c).readFloat(),
                z: entity.ptr.add(0x40).readFloat()
            };
            rt.flightLimitLogged = false;
            return 1.0;
        }
        var x = entity.ptr.add(0x38).readFloat();
        var y = entity.ptr.add(0x3c).readFloat();
        var z = entity.ptr.add(0x40).readFloat();
        var dx = x - rt.flightOrigin.x;
        var dy = y - rt.flightOrigin.y;
        var dz = z - rt.flightOrigin.z;
        var distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (distance <= 180.0) return 1.0;
        if (!rt.flightLimitLogged) {
            rt.flightLimitLogged = true;
            log("flight soft limit distance=" + distance.toFixed(1));
        }
        return Math.max(0.0, (260.0 - distance) / 80.0);
    }

    function flyEntity(entity) {
        if (!rt.fly) return false;
        var ptrValue = entity.ptr;
        var vx = ptrValue.add(0x168).readFloat();
        var vy = ptrValue.add(0x16c).readFloat();
        var vz = ptrValue.add(0x170).readFloat();
        if (!isFinite(vx) || !isFinite(vy) || !isFinite(vz)) return true;
        var input = entity.vehicle ? rightHeld() : leftHeld();
        if (!input) {
            if (Math.abs(vx) > 0.002) ptrValue.add(0x168).writeFloat(0.0);
            if (Math.abs(vy) > 0.002) ptrValue.add(0x16c).writeFloat(0.0);
            if (Math.abs(vz) > 0.002) ptrValue.add(0x170).writeFloat(0.0);
            rt.writesVertical++;
            return true;
        }
        var direction = cameraDirection();
        if (direction === null) {
            if (!rt.cameraWarned) { rt.cameraWarned = true; log("camera direction unavailable; flight held safely"); }
            ptrValue.add(0x170).writeFloat(0.0);
            return true;
        }
        var speed = flightSpeed(entity.vehicle) * flightScale(entity);
        ptrValue.add(0x168).writeFloat(direction.x * speed);
        ptrValue.add(0x16c).writeFloat(direction.y * speed);
        ptrValue.add(0x170).writeFloat(direction.z * speed);
        if (entity.vehicle) rt.writesVehicle++;
        else rt.writesPlayer++;
        rt.writesVertical++;
        return true;
    }

    function verticalPlayer(ptrValue) {
        var vz = ptrValue.add(0x170).readFloat();
        if (!isFinite(vz) || Math.abs(vz) > 10) return;
        if (rt.waterWalk) {
            if (Math.abs(vz + 0.055) > 0.002) {
                ptrValue.add(0x170).writeFloat(-0.055);
                rt.writesVertical++;
            }
            return;
        }
        if (vz <= 0.008) rt.jumpArmed = true;
        if (rt.jump > 1.0 && rt.jumpArmed && vz > 0.020) {
            var multiplier = rt.jump <= 1.5 ? 2.2 : (rt.jump <= 2.0 ? 2.8 : 3.5);
            var cap = rt.jump <= 1.5 ? 0.48 : (rt.jump <= 2.0 ? 0.66 : 0.86);
            ptrValue.add(0x170).writeFloat(Math.min(cap, vz * multiplier));
            rt.jumpArmed = false;
            rt.writesVertical++;
        } else if (Date.now() < rt.landingUntil && vz < -0.055) {
            ptrValue.add(0x170).writeFloat(-0.055);
            rt.writesVertical++;
        } else if (rt.safeFall && vz < -0.18) {
            ptrValue.add(0x170).writeFloat(-0.12);
            rt.writesVertical++;
        }
    }

    function tick() {
        var active = rt.speed > 1.0 || rt.jump > 1.0 || rt.safeFall || rt.endlessRun ||
            rt.fly || rt.waterWalk || rt.waterDrive || rt.vehicleCruise || Date.now() < rt.brakeUntil;
        if (!active) return;
        var entity = selectedEntity();
        if (entity === null) return;
        try {
            if (entity.vehicle) {
                if (flyEntity(entity)) return;
                if (Date.now() < rt.brakeUntil) {
                    entity.ptr.add(0x168).writeFloat(0.0);
                    entity.ptr.add(0x16c).writeFloat(0.0);
                    rt.writesVehicle++;
                    return;
                }
                if (rt.waterDrive) {
                    entity.ptr.add(0x170).writeFloat(0.0);
                    rt.writesVertical++;
                }
                if (rightHeld()) {
                    var vp = vehicleProfile();
                    if (vp !== null) accelerate(entity.ptr, vp, "vehicle");
                    else if (rt.vehicleCruise) accelerate(entity.ptr, { cap: 0.38, step: 0.0012 }, "vehicle");
                }
            } else {
                if (flyEntity(entity)) return;
                verticalPlayer(entity.ptr);
                if (leftHeld()) {
                    var pp = rt.waterWalk ? waterProfile() : playerProfile();
                    if (pp !== null) accelerate(entity.ptr, pp, "player");
                    else if (rt.endlessRun) accelerate(entity.ptr, { cap: 0.105, step: 0.0008 }, "player");
                }
            }
        } catch (error) {
            rt.errors++;
            if (rt.errors <= 3) log("error=" + error);
        }
    }

    readConfig();
    attachTouch();
    setInterval(readConfig, 500);
    setInterval(attachTouch, 500);
    setInterval(tick, 20);
    setInterval(function () {
        if (rt.writesVehicle || rt.writesPlayer || rt.writesVertical || rt.errors) {
            log("writes10s vehicle=" + rt.writesVehicle + " player=" + rt.writesPlayer +
                " vertical=" + rt.writesVertical + " errors=" + rt.errors);
            rt.writesVehicle = 0;
            rt.writesPlayer = 0;
            rt.writesVertical = 0;
        }
    }, 10000);
    log("loader active; vehicle caps=0.53/0.58/0.63 player caps=0.55/0.72/0.92");
})();
