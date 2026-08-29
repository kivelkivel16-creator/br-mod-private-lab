// BR MOD v6.2 diagnostic baseline: no hooks, no timers, no memory reads/writes.
(function () {
    if (globalThis.__brBaselineV62) return;
    globalThis.__brBaselineV62 = true;
    var root = "/sdcard/Android/data/com.br.top/files/";
    try {
        var status = new File(root + "br_status.txt", "w");
        status.write("БАЗОВЫЙ РЕЖИМ v6.2\nМОДУЛИ ИГРЫ ВРЕМЕННО ОТКЛЮЧЕНЫ\n");
        status.flush();
        status.close();
    } catch (_) {}
    try {
        var log = new File(root + "br_log.txt", "a");
        log.write("[baseline-v6.2] no hooks, timers or game-memory access\n");
        log.flush();
        log.close();
    } catch (_) {}
})();
