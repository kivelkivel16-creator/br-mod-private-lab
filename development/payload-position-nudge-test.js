// One-meter local position write test on the authorized private server.
if (!globalThis.__brPositionNudgeTest) {
    globalThis.__brPositionNudgeTest = true;
    var nudgeLog = "/sdcard/Android/data/com.br.top/files/br_log.txt";
    function nudgeWrite(line) {
        try {
            var f = new File(nudgeLog, "a");
            f.write("[nudge-test] " + line + "\n");
            f.flush();
            f.close();
        } catch (_) {}
    }
    function selectedEntity(module) {
        var holder = module.base.add(0x19d9920).readPointer();
        var index = holder.readU16();
        var wrapper = module.base.add(0x2b2f120 + index * 0xf8).readPointer();
        if (wrapper.isNull()) return NULL;
        var attached = wrapper.add(0x500).readPointer();
        var flag = wrapper.add(0x508).readU8();
        return flag !== 0 && !attached.isNull() ? attached : wrapper;
    }
    var nudgeModule = Process.findModuleByName("libblackrussia-client.so");
    try {
        var nudgeEntity = selectedEntity(nudgeModule);
        var oldX = nudgeEntity.add(0x38).readFloat();
        var oldY = nudgeEntity.add(0x3c).readFloat();
        var oldZ = nudgeEntity.add(0x40).readFloat();
        nudgeEntity.add(0x38).writeFloat(oldX + 1.0);
        nudgeWrite("write " + oldX.toFixed(3) + " -> " + (oldX + 1.0).toFixed(3) +
            " y=" + oldY.toFixed(3) + " z=" + oldZ.toFixed(3));
        var nudgeCount = 0;
        var nudgeTimer = setInterval(function () {
            var entity = selectedEntity(nudgeModule);
            nudgeWrite("after" + (nudgeCount + 1) + "=" +
                entity.add(0x38).readFloat().toFixed(3) + "," +
                entity.add(0x3c).readFloat().toFixed(3) + "," +
                entity.add(0x40).readFloat().toFixed(3));
            nudgeCount++;
            if (nudgeCount >= 6) clearInterval(nudgeTimer);
        }, 1000);
    } catch (error) {
        nudgeWrite("error=" + error);
    }
}
