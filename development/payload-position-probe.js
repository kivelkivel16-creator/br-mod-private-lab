// One-shot local entity probe for the authorized private test build.
if (!globalThis.__brPositionProbe) {
    globalThis.__brPositionProbe = true;
    var probeRoot = "/sdcard/Android/data/com.br.top/files/";
    var probeLog = probeRoot + "br_log.txt";
    function probeWrite(line) {
        try {
            var f = new File(probeLog, "a");
            f.write("[pos-probe] " + line + "\n");
            f.flush();
            f.close();
        } catch (_) {}
    }
    var probeCount = 0;
    var probeTimer = setInterval(function () {
        var module = Process.findModuleByName("libblackrussia-client.so");
        if (module === null) return;
        try {
            var getEntity = new NativeFunction(module.base.add(0xc07a30), "pointer", []);
            var entity = getEntity();
            if (entity.isNull()) {
                probeWrite("entity=null");
            } else {
                var x = entity.add(0x38).readFloat();
                var y = entity.add(0x3c).readFloat();
                var z = entity.add(0x40).readFloat();
                var type = entity.add(0x408).readS32();
                probeWrite("entity=" + entity + " type=" + type +
                    " pos=" + x.toFixed(3) + "," + y.toFixed(3) + "," + z.toFixed(3));
            }
        } catch (error) {
            probeWrite("error=" + error);
        }
        probeCount++;
        if (probeCount >= 5) clearInterval(probeTimer);
    }, 1000);
    probeWrite("loaded");
}
