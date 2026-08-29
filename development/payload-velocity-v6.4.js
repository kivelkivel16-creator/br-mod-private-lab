// BR MOD v6.4 velocity boost for selected local player/current vehicle only.
// Uses confirmed linear-velocity vector at +0x168/+0x16c/+0x170.
(function () {
    if (globalThis.__brVelocityV64) return;
    var base = globalThis.__brCoreV4;
    if (base === undefined) return;
    var root = "/sdcard/Android/data/com.br.top/files/";
    var cfgPath = root + "br_cfg.txt";
    var logPath = root + "br_log.txt";
    var factor = 1.0;
    var writes = 0;
    var errors = 0;
    var lastReport = 0;

    function log(message) {
        try {
            var f = new File(logPath, "a");
            f.write("[velocity-v6.4] " + message + "\n");
            f.flush();
            f.close();
        } catch (_) {}
    }

    function readConfig() {
        try {
            var f = new File(cfgPath, "r");
            var text = f.readText(4096) || "";
            f.close();
            var match = /^speed\s*=\s*([^\r\n]+)/m.exec(text);
            var next = match === null ? 1.0 : parseFloat(match[1]);
            if (next !== 1.0 && next !== 1.5 && next !== 2.0 && next !== 3.0) next = 1.0;
            if (next !== factor) log("factor=" + next.toFixed(1));
            factor = next;
            // Disable obsolete coordinate amplification in already-running v4 core.
            base.speed = 1.0;
        } catch (_) {}
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
            return { ptr: vehicle ? attached : wrapper, vehicle: vehicle };
        } catch (_) { return null; }
    }

    function joystickActive() {
        for (var i = 0; i < base.joystick.length; i++) {
            if (base.joystick[i].active) return true;
        }
        return false;
    }

    function tick() {
        // Keep old coordinate accelerator neutral even after its config poll.
        base.speed = 1.0;
        if (factor <= 1.0) return;
        var entity = selectedEntity();
        if (entity === null) return;
        try {
            var vx = entity.ptr.add(0x168).readFloat();
            var vy = entity.ptr.add(0x16c).readFloat();
            var vz = entity.ptr.add(0x170).readFloat();
            if (!isFinite(vx) || !isFinite(vy) || !isFinite(vz) ||
                    Math.abs(vx) > 10 || Math.abs(vy) > 10 || Math.abs(vz) > 10) return;
            var magnitude = Math.sqrt(vx * vx + vy * vy);
            if (magnitude < 0.012) return;
            if (!entity.vehicle && !joystickActive()) return;
            var cap = (entity.vehicle ? 0.45 : 0.11) * factor;
            if (magnitude >= cap * 0.995) return;
            var gain = 1.0 + (factor - 1.0) * 0.35;
            var desired = Math.min(cap, magnitude * gain);
            if (desired <= magnitude * 1.01) return;
            var scale = desired / magnitude;
            entity.ptr.add(0x168).writeFloat(vx * scale);
            entity.ptr.add(0x16c).writeFloat(vy * scale);
            writes++;
            var now = Date.now();
            if (now - lastReport > 3000) {
                lastReport = now;
                log("mode=" + (entity.vehicle ? "vehicle" : "player") +
                    " factor=" + factor.toFixed(1) + " speed=" + magnitude.toFixed(3) +
                    " -> " + desired.toFixed(3));
            }
        } catch (error) {
            errors++;
            if (errors <= 3) log("error=" + error);
        }
    }

    globalThis.__brVelocityV64 = true;
    readConfig();
    setInterval(readConfig, 500);
    setInterval(tick, 20);
    setInterval(function () {
        if (writes > 0 || errors > 0) {
            log("writes10s=" + writes + " errors=" + errors);
            writes = 0;
        }
    }, 10000);
    log("loader active");
})();
