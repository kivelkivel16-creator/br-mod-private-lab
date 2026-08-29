// BR MOD v5 self/own-vehicle movement assists.
// Requires payload-core-v4.js in same loader; no packet or remote-entity hooks.

var BR5_ROOT = "/sdcard/Android/data/com.br.top/files/";
var BR5_CFG = BR5_ROOT + "br_cfg.txt";
var BR5_LOG = BR5_ROOT + "br_log.txt";

function br5Log(message) {
    try {
        var f = new File(BR5_LOG, "a");
        f.write("[core-v5-extra] " + message + "\n");
        f.flush();
        f.close();
    } catch (_) {}
}

if (globalThis.__brCoreV5Extra) {
    br5Log("reload ignored: extension already active");
} else {
    var ex = {
        target: null,
        armed: false,
        endlessRun: false,
        noFreeze: false,
        fly: false,
        waterWalk: false,
        waterDrive: false,
        vehicleCruise: false,
        actionSeq: null,
        key: null,
        last: null,
        lastAt: 0,
        dir: null,
        runPeak: 0,
        vehiclePeak: 0,
        stationarySince: 0,
        altitudeAnchor: null,
        altitudeMode: null,
        pendingAltitude: 0,
        brakeUntil: 0,
        brakeAnchor: null,
        writes: 0,
        errors: 0
    };
    globalThis.__brCoreV5Extra = ex;

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

    function readConfig() {
        var text = readText(BR5_CFG, 4096);
        if (text.length === 0) return;
        var nextRun = false;
        var nextFreeze = false;
        var nextFly = cfgValue(text, "fly", "0") === "1";
        var nextWaterWalk = cfgValue(text, "waterwalk", "0") === "1";
        var nextWaterDrive = cfgValue(text, "waterdrive", "0") === "1";
        var nextVehicleCruise = false;
        var changed = nextRun !== ex.endlessRun || nextFreeze !== ex.noFreeze ||
            nextFly !== ex.fly || nextWaterWalk !== ex.waterWalk ||
            nextWaterDrive !== ex.waterDrive || nextVehicleCruise !== ex.vehicleCruise;
        ex.endlessRun = nextRun;
        ex.noFreeze = nextFreeze;
        ex.fly = nextFly;
        ex.waterWalk = nextWaterWalk;
        ex.waterDrive = nextWaterDrive;
        ex.vehicleCruise = nextVehicleCruise;

        var sequence = parseInt(cfgValue(text, "action_seq", "0"), 10);
        if (!isFinite(sequence)) sequence = 0;
        if (ex.actionSeq === null) ex.actionSeq = sequence;
        else if (sequence !== ex.actionSeq) {
            ex.actionSeq = sequence;
            var action = cfgValue(text, "action", "none");
            if (action === "up") ex.pendingAltitude += 2.5;
            else if (action === "down") ex.pendingAltitude -= 2.5;
            br5Log("action=" + action + " seq=" + sequence);
        }
        if (changed) {
            ex.altitudeAnchor = null;
            ex.altitudeMode = null;
            br5Log("cfg run=" + ex.endlessRun + " nofreeze=" + ex.noFreeze +
                " fly=" + ex.fly + " waterwalk=" + ex.waterWalk +
                " waterdrive=" + ex.waterDrive + " cruise=" + ex.vehicleCruise);
        }
    }

    function finiteCoord(value) { return isFinite(value) && Math.abs(value) < 100000.0; }

    function selectedEntity() {
        if (ex.target === null) return null;
        try {
            var holder = ex.target.base.add(0x19d9920).readPointer();
            if (holder.isNull()) return null;
            var index = holder.readU16();
            if (index > 4095) return null;
            var wrapper = ex.target.base.add(0x2b2f120 + index * 0xf8).readPointer();
            if (wrapper.isNull()) return null;
            var attached = wrapper.add(0x500).readPointer();
            var vehicle = wrapper.add(0x508).readU8() !== 0 && !attached.isNull();
            var entity = vehicle ? attached : wrapper;
            var x = entity.add(0x38).readFloat();
            var y = entity.add(0x3c).readFloat();
            var z = entity.add(0x40).readFloat();
            if (!finiteCoord(x) || !finiteCoord(y) || !finiteCoord(z)) return null;
            return { ptr: entity, key: entity.toString() + (vehicle ? ":v" : ":p"),
                x: x, y: y, z: z, vehicle: vehicle };
        } catch (_) { return null; }
    }

    function joystickActive() {
        var base = globalThis.__brCoreV4;
        if (base === undefined || base.joystick === undefined) return false;
        for (var i = 0; i < base.joystick.length; i++) {
            if (base.joystick[i].active) return true;
        }
        return false;
    }

    function resetState(entity, now) {
        ex.key = entity === null ? null : entity.key;
        ex.last = entity === null ? null : { x: entity.x, y: entity.y, z: entity.z };
        ex.lastAt = now;
        ex.runPeak = 0;
        ex.vehiclePeak = 0;
        ex.stationarySince = 0;
        ex.altitudeAnchor = null;
        ex.altitudeMode = null;
        ex.brakeAnchor = null;
    }

    function activeAltitudeMode(entity) {
        if (entity.vehicle) return ex.waterDrive ? "vehicle-water" : null;
        return null;
    }

    function tick() {
        if (!ex.armed) return;
        var now = Date.now();
        var active = ex.endlessRun || ex.noFreeze ||
            ex.waterDrive || ex.vehicleCruise || ex.pendingAltitude !== 0 || now < ex.brakeUntil;
        if (!active) {
            if (ex.key !== null) resetState(null, now);
            return;
        }
        var entity = selectedEntity();
        if (entity === null) {
            if (ex.key !== null) resetState(null, now);
            return;
        }
        if (ex.key !== entity.key || ex.last === null || now - ex.lastAt <= 0 || now - ex.lastAt > 180) {
            resetState(entity, now);
            return;
        }

        var dt = now - ex.lastAt;
        var dx = entity.x - ex.last.x;
        var dy = entity.y - ex.last.y;
        var dz = entity.z - ex.last.z;
        var horizontal = Math.sqrt(dx * dx + dy * dy);
        var maxNatural = entity.vehicle ? 1.8 + dt * 0.10 : 0.55 + dt * 0.035;
        if (horizontal > maxNatural || Math.abs(dz) > maxNatural * 1.8) {
            resetState(entity, now);
            return;
        }

        var input = joystickActive();
        if (horizontal > 0.002) ex.dir = { x: dx / horizontal, y: dy / horizontal };
        var outX = entity.x;
        var outY = entity.y;
        var outZ = entity.z;

        if (!entity.vehicle && ex.endlessRun && input) {
            if (horizontal > ex.runPeak && horizontal < 0.20) ex.runPeak = horizontal;
            else ex.runPeak *= 0.999;
            if (ex.dir !== null && horizontal > 0.002 && ex.runPeak > horizontal * 1.15) {
                var runExtra = Math.min(0.025, ex.runPeak * 0.88 - horizontal);
                if (runExtra > 0) { outX += ex.dir.x * runExtra; outY += ex.dir.y * runExtra; }
            }
        } else ex.runPeak *= 0.96;

        if (entity.vehicle && ex.vehicleCruise && input) {
            if (horizontal > ex.vehiclePeak && horizontal < 0.80) ex.vehiclePeak = horizontal;
            else ex.vehiclePeak *= 0.999;
            if (horizontal < 0.002) {
                if (ex.stationarySince === 0) ex.stationarySince = now;
            } else ex.stationarySince = 0;
            if (ex.dir !== null && ex.vehiclePeak > 0.01 && horizontal < ex.vehiclePeak * 0.75) {
                var vehicleExtra = Math.min(0.050, ex.vehiclePeak * 0.75 - horizontal);
                if (horizontal > 0.002 || now - ex.stationarySince < 1800) {
                    outX += ex.dir.x * vehicleExtra;
                    outY += ex.dir.y * vehicleExtra;
                }
            }
        } else ex.vehiclePeak *= 0.96;

        if (!entity.vehicle && ex.noFreeze && input && ex.dir !== null) {
            if (horizontal < 0.0015) {
                if (ex.stationarySince === 0) ex.stationarySince = now;
                if (now - ex.stationarySince > 650) {
                    outX += ex.dir.x * 0.015;
                    outY += ex.dir.y * 0.015;
                }
            } else ex.stationarySince = 0;
        }

        var altitudeMode = activeAltitudeMode(entity);
        if (altitudeMode !== ex.altitudeMode) {
            ex.altitudeMode = altitudeMode;
            if (altitudeMode === null) ex.altitudeAnchor = null;
            else if (altitudeMode === "vehicle-water") ex.altitudeAnchor = entity.z - 0.80;
            else ex.altitudeAnchor = entity.z;
            if (altitudeMode !== null) br5Log("altitude mode=" + altitudeMode + " anchor=" + ex.altitudeAnchor);
        }
        if (altitudeMode !== null) {
            if (ex.altitudeAnchor === null) ex.altitudeAnchor = entity.z;
            if (ex.pendingAltitude !== 0) {
                ex.altitudeAnchor += ex.pendingAltitude;
                ex.pendingAltitude = 0;
            }
            outZ = ex.altitudeAnchor;
        } else ex.pendingAltitude = 0;

        if (entity.vehicle && now < ex.brakeUntil) {
            if (ex.brakeAnchor === null) ex.brakeAnchor = { x: entity.x, y: entity.y, z: entity.z };
            outX = ex.brakeAnchor.x;
            outY = ex.brakeAnchor.y;
            if (!ex.waterDrive) outZ = ex.brakeAnchor.z;
        } else if (now >= ex.brakeUntil) ex.brakeAnchor = null;

        try {
            if (outX !== entity.x) entity.ptr.add(0x38).writeFloat(outX);
            if (outY !== entity.y) entity.ptr.add(0x3c).writeFloat(outY);
            if (outZ !== entity.z) entity.ptr.add(0x40).writeFloat(outZ);
            if (outX !== entity.x || outY !== entity.y || outZ !== entity.z) ex.writes++;
            ex.last = { x: outX, y: outY, z: outZ };
            ex.lastAt = now;
        } catch (error) {
            ex.errors++;
            resetState(entity, now);
            br5Log("write error: " + error);
        }
    }

    function tryArm() {
        if (ex.armed) return;
        ex.target = Process.findModuleByName("libblackrussia-client.so");
        if (ex.target === null || globalThis.__brCoreV4 === undefined) return;
        ex.armed = true;
        br5Log("armed target=" + ex.target.base + " with v4 base");
    }

    setInterval(readConfig, 500);
    setInterval(tryArm, 500);
    setInterval(tick, 20);
    setInterval(function () {
        if (ex.armed && (ex.writes > 0 || ex.errors > 0)) {
            br5Log("writes10s=" + ex.writes + " errors=" + ex.errors + " mode=" + ex.altitudeMode);
            ex.writes = 0;
        }
    }, 10000);
    readConfig();
    tryArm();
    br5Log("loader active");
}

// v5-extra-signature-20260828-a
