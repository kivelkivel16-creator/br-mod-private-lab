// One-session probe for two exported client switches.
(function () {
    if (globalThis.__brNativeToggleProbe) return;
    globalThis.__brNativeToggleProbe = true;
    var root = "/sdcard/Android/data/com.br.top/files/";
    var modeFile = root + "native_toggle_probe.txt";
    var logFile = root + "br_log.txt";
    var last = "";
    var hud = null;
    var blur = null;

    function log(message) {
        try {
            var f = new File(logFile, "a");
            f.write("[toggle-probe] " + message + "\n");
            f.flush();
            f.close();
        } catch (_) {}
    }

    function poll() {
        if (hud === null || blur === null) {
            var target = Process.findModuleByName("libblackrussia-client.so");
            if (target === null) return;
            var hp = target.findExportByName("Java_com_blackhub_bronline_game_core_JNILib_toggleDrawing2dStuff");
            var bp = target.findExportByName("Java_com_blackhub_bronline_game_core_JNILib_toggleBloor");
            if (hp === null || bp === null) return;
            hud = new NativeFunction(hp, "void", ["pointer", "pointer", "int"]);
            blur = new NativeFunction(bp, "void", ["pointer", "pointer", "int"]);
            log("armed");
        }
        var text = "";
        try {
            var f = new File(modeFile, "r");
            text = (f.readText(128) || "").trim();
            f.close();
        } catch (_) { return; }
        if (text === last) return;
        last = text;
        var fields = text.split(/\s+/);
        var h = fields[0] === "1" ? 1 : 0;
        var b = fields[1] === "1" ? 1 : 0;
        hud(NULL, NULL, h);
        blur(NULL, NULL, b);
        log("hudArg=" + h + " blurArg=" + b);
    }
    setInterval(poll, 250);
    poll();
})();
// probe-signature-20260827
