// BR MOD v6.5 conservative vehicle acceleration for selected current vehicle only.
// No anticheat bypass: small capped acceleration is applied only while gas is held.
(function () {
    if (globalThis.__brVelocityV65) return;
    var base = globalThis.__brCoreV4;
    if (base === undefined) return;
    var root = "/sdcard/Android/data/com.br.top/files/";
    var cfgPath = root + "br_cfg.txt";
    var logPath = root + "br_log.txt";
    var rt = {
        factor: 1.0,
        target: null,
        touchAttached: false,
        active: [false, false, false],
        coords: [{x: 0, y: 0}, {x: 0, y: 0}, {x: 0, y: 0}],
        touchLogs: 0,
        writes: 0,
        errors: 0
    };
    globalThis.__brVelocityV65 = rt;

    function log(message) {
        try {
            var f = new File(logPath, "a");
            f.write("[velocity-v6.5] " + message + "\n");
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
            if (next !== rt.factor) log("level=" + next.toFixed(1));
            rt.factor = next;
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
                if ((action === 0 || action === 5) && rt.touchLogs < 8) {
                    rt.touchLogs++;
                    log("touch-down id=" + id + " x=" + rt.coords[id].x + " y=" + rt.coords[id].y);
                }
            }
        });
        rt.touchAttached = true;
        log("touch tracker ready");
    }

    function gasHeld() {
        for (var i = 0; i < 3; i++) {
            if (rt.active[i] && rt.coords[i].x >= 650 && rt.coords[i].y >= 300) return true;
        }
        return false;
    }

    function selectedVehicle() {
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
            return vehicle ? attached : null;
        } catch (_) { return null; }
    }

    function profile() {
        if (rt.factor <= 1.0) return null;
        if (rt.factor <= 1.5) return { cap: 0.46, step: 0.0012 };
        if (rt.factor <= 2.0) return { cap: 0.49, step: 0.0018 };
        return { cap: 0.52, step: 0.0025 };
    }

    function tick() {
        var p = profile();
        if (p === null || !gasHeld()) return;
        var vehicle = selectedVehicle();
        if (vehicle === null) return;
        try {
            var vx = vehicle.add(0x168).readFloat();
            var vy = vehicle.add(0x16c).readFloat();
            if (!isFinite(vx) || !isFinite(vy) || Math.abs(vx) > 10 || Math.abs(vy) > 10) return;
            var magnitude = Math.sqrt(vx * vx + vy * vy);
            if (magnitude < 0.02 || magnitude >= p.cap) return;
            var desired = Math.min(p.cap, magnitude + p.step);
            var scale = desired / magnitude;
            vehicle.add(0x168).writeFloat(vx * scale);
            vehicle.add(0x16c).writeFloat(vy * scale);
            rt.writes++;
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
        if (rt.writes > 0 || rt.errors > 0) {
            log("writes10s=" + rt.writes + " errors=" + rt.errors + " gas=" + gasHeld());
            rt.writes = 0;
        }
    }, 10000);
    log("loader active; caps=0.46/0.49/0.52");
})();
