// BR MOD v6.5 loader: optimized cores plus conservative current-vehicle acceleration.
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
    load("br_velocity_v65.js");
})();
