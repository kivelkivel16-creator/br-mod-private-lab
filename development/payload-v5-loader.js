// BR MOD v5 loader. Files are deployed beside this payload.
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
})();
