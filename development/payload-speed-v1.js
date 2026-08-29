// BR MOD speed v1 — private test environment only.
// Reads speed=1.0/1.5/2.0/3.0 from br_cfg.txt and scales monotonic
// time only for calls originating inside libblackrussia-client.so.

var ROOT = "/sdcard/Android/data/com.br.top/files/";
var CFG = ROOT + "br_cfg.txt";
var LOGF = ROOT + "br_log.txt";

function brLog(message) {
    try {
        var f = new File(LOGF, "a");
        f.write("[speed-v1] " + message + "\n");
        f.flush();
        f.close();
    } catch (_) {}
}

if (globalThis.__brSpeedV1) {
    brLog("reload ignored: hook already active");
} else {
    var runtime = {
        armed: false,
        speed: 1.0,
        target: null,
        clocks: {},
        scaledCalls: 0,
        totalCalls: 0
    };
    globalThis.__brSpeedV1 = runtime;

    function readSpeed() {
        var text = "";
        try {
            var f = new File(CFG, "r");
            text = f.readText(4096) || "";
            f.close();
        } catch (_) {
            return;
        }

        var match = /^speed\s*=\s*([0-9]+(?:\.[0-9]+)?)/m.exec(text);
        if (match === null) return;

        var next = parseFloat(match[1]);
        if (next !== 1.0 && next !== 1.5 && next !== 2.0 && next !== 3.0) {
            next = 1.0;
        }
        if (next !== runtime.speed) {
            brLog("speed " + runtime.speed.toFixed(1) + " -> " + next.toFixed(1));
            runtime.speed = next;
        }
    }

    function isInsideTarget(address) {
        if (runtime.target === null) return false;
        return address.compare(runtime.target.base) >= 0 &&
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
        // Reset on a clock discontinuity or a long pause/resume.
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

    function tryArm() {
        if (runtime.armed) return;

        var target = Process.findModuleByName("libblackrussia-client.so");
        if (target === null) return;

        var libc = Process.findModuleByName("libc.so");
        if (libc === null) return;

        var clockGettime = libc.findExportByName("clock_gettime");
        if (clockGettime === null) {
            brLog("clock_gettime export not found");
            return;
        }

        runtime.target = target;
        runtime.armed = true;

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

        brLog("armed target=" + target.base + " size=" + target.size);
    }

    setInterval(readSpeed, 250);
    setInterval(tryArm, 500);
    setInterval(function () {
        if (!runtime.armed) return;
        brLog("speed=" + runtime.speed.toFixed(1) +
            " scaled5s=" + runtime.scaledCalls +
            " total5s=" + runtime.totalCalls);
        runtime.scaledCalls = 0;
        runtime.totalCalls = 0;
    }, 5000);

    readSpeed();
    tryArm();
    brLog("loader active");
}
