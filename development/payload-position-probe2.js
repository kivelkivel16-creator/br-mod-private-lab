// Local wrapper/vehicle position probe for the authorized private test build.
if (!globalThis.__brPositionProbe2) {
    globalThis.__brPositionProbe2 = true;
    var p2Log = "/sdcard/Android/data/com.br.top/files/br_log.txt";
    function p2Write(line) {
        try {
            var f = new File(p2Log, "a");
            f.write("[pos-probe2] " + line + "\n");
            f.flush();
            f.close();
        } catch (_) {}
    }
    var p2Count = 0;
    var p2Timer = setInterval(function () {
        var module = Process.findModuleByName("libblackrussia-client.so");
        if (module === null) return;
        try {
            var indexHolder = module.base.add(0x19d9920).readPointer();
            var index = indexHolder.readU16();
            var slot = module.base.add(0x2b2f120 + index * 0xf8);
            var wrapper = slot.readPointer();
            if (wrapper.isNull()) {
                p2Write("index=" + index + " wrapper=null");
            } else {
                var attached = wrapper.add(0x500).readPointer();
                var attachedFlag = wrapper.add(0x508).readU8();
                var entity = attachedFlag !== 0 && !attached.isNull() ? attached : wrapper;
                var x = entity.add(0x38).readFloat();
                var y = entity.add(0x3c).readFloat();
                var z = entity.add(0x40).readFloat();
                p2Write("index=" + index + " wrapper=" + wrapper +
                    " attached=" + attached + " flag=" + attachedFlag +
                    " entity=" + entity + " pos=" +
                    x.toFixed(3) + "," + y.toFixed(3) + "," + z.toFixed(3));
            }
        } catch (error) {
            p2Write("error=" + error);
        }
        p2Count++;
        if (p2Count >= 5) clearInterval(p2Timer);
    }, 1000);
    p2Write("loaded");
}
