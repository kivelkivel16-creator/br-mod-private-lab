// BR MOD diagnostic loader: v4 core only.
(function () {
    var root = "/sdcard/Android/data/com.br.top/files/";
    var f = new File(root + "br_core_v4.js", "r");
    var source = f.readText();
    f.close();
    (0, eval)(source);
})();
