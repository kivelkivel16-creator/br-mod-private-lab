// BR MOD v6.4 hot loader: optimized cores plus local velocity module.
(function () {
    var root = "/sdcard/Android/data/com.br.top/files/";
    function load(name) {
        var f = new File(root + name, "r");
        var source = f.readText();
        f.close();
        (0, eval)(source);
    }
    load("br_core_v4.js");
    load("br_core_v5_extra.js");
    load("br_velocity_v64.js");
})();
