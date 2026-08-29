// BR MOD v6.3b one-shot local motion probe. Starts from actual coordinate movement.
(function () {
    if (globalThis.__brSelfMotionProbeV63b) return;
    var base = globalThis.__brCoreV4;
    if (base === undefined) return;
    var root = "/sdcard/Android/data/com.br.top/files/";
    var outPath = root + "br_probe_v63b.txt";
    var samples = 0;
    var key = null;
    var started = false;
    var lastCoord = null;
    var stats = {};

    function write(line, append) {
        try {
            var f = new File(outPath, append ? "a" : "w");
            f.write(line + "\n");
            f.flush();
            f.close();
        } catch (_) {}
    }

    function entity() {
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
            return {
                ptr: ptrValue,
                key: ptrValue.toString() + (vehicle ? ":v" : ":p"),
                vehicle: vehicle,
                x: ptrValue.add(0x38).readFloat(),
                y: ptrValue.add(0x3c).readFloat(),
                z: ptrValue.add(0x40).readFloat()
            };
        } catch (_) { return null; }
    }

    function valid(value) { return isFinite(value) && Math.abs(value) < 100000.0; }

    function finish() {
        var rows = [];
        Object.keys(stats).forEach(function (name) {
            var s = stats[name];
            if (s.changes >= 4) rows.push(s);
        });
        rows.sort(function (a, b) {
            if (b.changes !== a.changes) return b.changes - a.changes;
            return b.sum - a.sum;
        });
        write("DONE samples=" + samples + " entity=" + key, true);
        for (var i = 0; i < Math.min(rows.length, 60); i++) {
            var r = rows[i];
            write("off=" + r.name + " changes=" + r.changes + " sum=" + r.sum.toFixed(6) +
                " min=" + r.min.toFixed(6) + " max=" + r.max.toFixed(6) + " last=" + r.last.toFixed(6), true);
        }
        clearInterval(timer);
    }

    function tick() {
        if (base.speed <= 1.0) return;
        var current = entity();
        if (current === null) return;
        if (key !== current.key) {
            key = current.key;
            started = false;
            samples = 0;
            stats = {};
            lastCoord = { x: current.x, y: current.y };
            write("WAIT entity=" + key + " vehicle=" + current.vehicle + " speed=" + base.speed, false);
            return;
        }
        var dx = current.x - lastCoord.x;
        var dy = current.y - lastCoord.y;
        lastCoord = { x: current.x, y: current.y };
        if (!started) {
            if (Math.sqrt(dx * dx + dy * dy) < 0.01) return;
            started = true;
            write("START moving dx=" + dx.toFixed(5) + " dy=" + dy.toFixed(5), true);
        }
        for (var offset = 0; offset < 0x300; offset += 4) {
            try {
                var value = current.ptr.add(offset).readFloat();
                if (!valid(value)) continue;
                var name = "0x" + offset.toString(16);
                var s = stats[name];
                if (s === undefined) {
                    stats[name] = { name: name, last: value, min: value, max: value, sum: 0, changes: 0 };
                    continue;
                }
                var delta = Math.abs(value - s.last);
                if (delta > 0.00001 && delta < 1000.0) { s.changes++; s.sum += delta; }
                s.last = value;
                if (value < s.min) s.min = value;
                if (value > s.max) s.max = value;
            } catch (_) {}
        }
        samples++;
        if (samples >= 30) finish();
    }

    globalThis.__brSelfMotionProbeV63b = true;
    write("WAIT: speed above x1; begin moving straight", false);
    var timer = setInterval(tick, 250);
})();
