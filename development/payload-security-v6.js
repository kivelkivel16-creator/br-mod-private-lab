// BR MOD v6 defensive network diagnostics.
// Records only call counts and byte totals. Packet bytes, addresses and credentials are never read.

var BR6_ROOT = "/sdcard/Android/data/com.br.top/files/";
var BR6_CFG = BR6_ROOT + "br_cfg.txt";
var BR6_SECURITY_LOG = BR6_ROOT + "br_security_log.txt";
var BR6_SECURITY_STATUS = BR6_ROOT + "br_security_status.txt";

(function () {
    if (globalThis.__brSecurityV6) return;

    var rt = {
        enabled: false,
        hooks: 0,
        txCalls: 0,
        txBytes: 0,
        rxCalls: 0,
        rxBytes: 0,
        errors: 0,
        buckets: { tiny: 0, small: 0, medium: 0, large: 0 }
    };
    globalThis.__brSecurityV6 = rt;

    function readText(path, max) {
        try {
            var f = new File(path, "r");
            var value = f.readText(max) || "";
            f.close();
            return value;
        } catch (_) { return ""; }
    }

    function cfgEnabled(text) {
        return /^securitylog\s*=\s*1\s*$/m.test(text);
    }

    function appendLine(line) {
        try {
            var f = new File(BR6_SECURITY_LOG, "a");
            f.write(new Date().toISOString() + " " + line + "\n");
            f.flush();
            f.close();
        } catch (_) {}
    }

    function writeStatus(lines) {
        try {
            var f = new File(BR6_SECURITY_STATUS, "w");
            f.write(lines.join("\n") + "\n");
            f.flush();
            f.close();
        } catch (_) {}
    }

    function resetWindow() {
        rt.txCalls = 0;
        rt.txBytes = 0;
        rt.rxCalls = 0;
        rt.rxBytes = 0;
        rt.errors = 0;
        rt.buckets.tiny = 0;
        rt.buckets.small = 0;
        rt.buckets.medium = 0;
        rt.buckets.large = 0;
    }

    function addBucket(length) {
        if (length <= 64) rt.buckets.tiny++;
        else if (length <= 256) rt.buckets.small++;
        else if (length <= 1024) rt.buckets.medium++;
        else rt.buckets.large++;
    }

    function addResult(direction, length) {
        if (length < 0) {
            rt.errors++;
            return;
        }
        if (direction === "tx") {
            rt.txCalls++;
            rt.txBytes += length;
        } else {
            rt.rxCalls++;
            rt.rxBytes += length;
        }
        addBucket(length);
    }

    function attachIo(name, direction, lengthArg) {
        var libc = Process.findModuleByName("libc.so");
        if (libc === null) return;
        var address = libc.findExportByName(name);
        if (address === null) return;
        Interceptor.attach(address, {
            onEnter: function (args) {
                this.br6Track = rt.enabled;
                this.br6Length = this.br6Track ? args[lengthArg].toUInt32() : 0;
            },
            onLeave: function (retval) {
                if (!this.br6Track) return;
                var actual = retval.toInt32();
                addResult(direction, actual >= 0 ? actual : -1);
            }
        });
        rt.hooks++;
    }

    attachIo("send", "tx", 2);
    attachIo("sendto", "tx", 2);
    attachIo("recv", "rx", 2);
    attachIo("recvfrom", "rx", 2);

    setInterval(function () {
        var next = cfgEnabled(readText(BR6_CFG, 4096));
        if (next !== rt.enabled) {
            rt.enabled = next;
            resetWindow();
            appendLine("diagnostics=" + (next ? "enabled" : "disabled") + " hooks=" + rt.hooks);
        }
    }, 500);

    setInterval(function () {
        if (!rt.enabled) {
            writeStatus(["СЕТЕВАЯ ДИАГНОСТИКА: ВЫКЛ", "Содержимое пакетов не читается"]);
            return;
        }
        var summary = "tx_calls=" + rt.txCalls + " tx_bytes=" + rt.txBytes +
            " rx_calls=" + rt.rxCalls + " rx_bytes=" + rt.rxBytes +
            " errors=" + rt.errors + " sizes=" + rt.buckets.tiny + "/" +
            rt.buckets.small + "/" + rt.buckets.medium + "/" + rt.buckets.large;
        appendLine(summary);
        writeStatus([
            "СЕТЕВАЯ ДИАГНОСТИКА: ВКЛ",
            "ЗА 5 СЕК: TX " + rt.txCalls + " / " + rt.txBytes + " БАЙТ; RX " + rt.rxCalls + " / " + rt.rxBytes + " БАЙТ",
            "ПАКЕТЫ: ≤64/≤256/≤1024/>1024 = " + rt.buckets.tiny + "/" + rt.buckets.small + "/" + rt.buckets.medium + "/" + rt.buckets.large
        ]);
        resetWindow();
    }, 5000);

    writeStatus(["СЕТЕВАЯ ДИАГНОСТИКА: ВЫКЛ", "Содержимое пакетов не читается"]);
    appendLine("loader active hooks=" + rt.hooks);
})();
