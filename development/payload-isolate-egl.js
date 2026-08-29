// Diagnostic isolate: eglSwapBuffers hook only.
(function () {
    if (globalThis.__brIsolateEgl) return;
    globalThis.__brIsolateEgl = true;
    var timer = setInterval(function () {
        var egl = Process.findModuleByName("libEGL.so");
        if (egl === null) return;
        var swap = egl.findExportByName("eglSwapBuffers");
        if (swap === null) return;
        Interceptor.attach(swap, { onEnter: function () {} });
        clearInterval(timer);
    }, 200);
})();
