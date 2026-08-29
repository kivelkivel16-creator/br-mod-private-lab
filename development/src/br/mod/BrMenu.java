package br.mod;

import android.content.Context;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;

/** BR MOD controls for the owner's private Black Russia test server. */
public final class BrMenu {
    private static final int COLOR_OFF = Color.parseColor("#CC252B35");
    private static final int COLOR_ON = Color.parseColor("#CC007C91");
    private static final int COLOR_ACTION = Color.parseColor("#CC394957");
    private static final int COLOR_RESET = Color.parseColor("#CC713A45");

    private static Context appCtx;
    private static WindowManager wm;
    private static View panel;
    private static View handle;
    private static TextView status;
    private static TextView infoHud;
    private static boolean panelShown;
    private static boolean infoShown;

    private static Button bSpd;
    private static Button bRun;
    private static Button bAfk;
    private static Button bHud;
    private static Button bBlur;
    private static Button bInfo;
    private static Button bDbg;
    private static Button bAwake;

    private static boolean stDebug;
    private static float stSpeed = 1.0f;
    private static boolean stAutoRun;
    private static boolean stAntiAfk;
    private static boolean stGameHud = true;
    private static boolean stBlur;
    private static boolean stInfoHud;
    private static boolean stAwake = true;
    private static Handler statusHandler;

    private BrMenu() {}

    public static void init(Context context) {
        try {
            if (handle != null) return;
            appCtx = context.getApplicationContext();
            wm = (WindowManager) appCtx.getSystemService(Context.WINDOW_SERVICE);
            loadCfg();
            // A held synthetic joystick must never resume unexpectedly after restart.
            stAutoRun = false;
            buildUi();
            saveCfg();
            startStatusUpdates();
        } catch (Throwable ignored) {
        }
    }

    private static WindowManager.LayoutParams mkParams(int x, int y) {
        WindowManager.LayoutParams p = new WindowManager.LayoutParams();
        p.type = 2038;
        p.flags = 8;
        p.format = -3;
        p.gravity = Gravity.TOP | Gravity.LEFT;
        p.x = x;
        p.y = y;
        p.width = -2;
        p.height = -2;
        return p;
    }

    private static WindowManager.LayoutParams mkPanelParams() {
        WindowManager.LayoutParams p = mkParams(40, 120);
        p.width = 710;
        p.height = 850;
        return p;
    }

    private static Button mkBtn(String text, int color, final Runnable action) {
        Button button = new Button(appCtx);
        button.setText(text);
        button.setTextSize(12.5f);
        button.setAllCaps(false);
        button.setTextColor(Color.WHITE);
        button.setGravity(Gravity.CENTER);
        tint(button, color);
        button.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View view) {
                try { action.run(); } catch (Throwable ignored) {}
            }
        });
        return button;
    }

    private static void tint(Button button, int color) {
        try { button.getBackground().mutate().setTint(color); } catch (Throwable ignored) {}
    }

    private static void addFull(LinearLayout root, View view) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2);
        p.setMargins(0, 4, 0, 4);
        root.addView(view, p);
    }

    private static void addPair(LinearLayout root, View left, View right) {
        LinearLayout row = new LinearLayout(appCtx);
        row.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -2, 1.0f);
        lp.setMargins(0, 4, 4, 4);
        LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(0, -2, 1.0f);
        rp.setMargins(4, 4, 0, 4);
        row.addView(left, lp);
        row.addView(right, rp);
        root.addView(row, new LinearLayout.LayoutParams(-1, -2));
    }

    private static File externalFile(String name) {
        File dir = appCtx.getExternalFilesDir(null);
        return dir == null ? null : new File(dir, name);
    }

    private static void loadCfg() {
        BufferedReader in = null;
        try {
            File file = externalFile("br_cfg.txt");
            if (file == null || !file.isFile()) return;
            in = new BufferedReader(new FileReader(file));
            String line;
            while ((line = in.readLine()) != null) {
                int split = line.indexOf('=');
                if (split <= 0) continue;
                String key = line.substring(0, split).trim();
                String value = line.substring(split + 1).trim();
                if ("debug".equals(key)) stDebug = "1".equals(value);
                else if ("speed".equals(key)) {
                    try { stSpeed = Float.parseFloat(value); } catch (Throwable ignored) {}
                }
                else if ("autorun".equals(key)) stAutoRun = "1".equals(value);
                else if ("antiafk".equals(key)) stAntiAfk = "1".equals(value);
                else if ("gamehud".equals(key)) stGameHud = "1".equals(value);
                else if ("draw2d".equals(key)) stGameHud = "1".equals(value);
                else if ("blur".equals(key)) stBlur = "1".equals(value);
                else if ("bloor".equals(key)) stBlur = "1".equals(value);
                else if ("infohud".equals(key)) stInfoHud = "1".equals(value);
                else if ("awake".equals(key)) stAwake = "1".equals(value);
            }
        } catch (Throwable ignored) {
        } finally {
            try { if (in != null) in.close(); } catch (Throwable ignored) {}
        }
        if (stSpeed != 1.0f && stSpeed != 1.5f && stSpeed != 2.0f && stSpeed != 3.0f) stSpeed = 1.0f;
    }

    private static void saveCfg() {
        FileWriter out = null;
        try {
            File file = externalFile("br_cfg.txt");
            if (file == null) return;
            out = new FileWriter(file, false);
            out.write("debug=" + (stDebug ? 1 : 0) + "\n");
            out.write("speed=" + stSpeed + "\n");
            out.write("autorun=" + (stAutoRun ? 1 : 0) + "\n");
            out.write("antiafk=" + (stAntiAfk ? 1 : 0) + "\n");
            out.write("gamehud=" + (stGameHud ? 1 : 0) + "\n");
            out.write("blur=" + (stBlur ? 1 : 0) + "\n");
            out.write("infohud=" + (stInfoHud ? 1 : 0) + "\n");
            out.write("awake=" + (stAwake ? 1 : 0) + "\n");
            out.flush();
        } catch (Throwable ignored) {
        } finally {
            try { if (out != null) out.close(); } catch (Throwable ignored) {}
        }
    }

    private static String onOff(boolean value) { return value ? "ON" : "OFF"; }

    private static void refreshButtons() {
        if (bSpd == null) return;
        bSpd.setText("SPEED: x" + stSpeed + (stSpeed > 1.0f ? "  •  AUTO-SMOOTH" : ""));
        tint(bSpd, stSpeed > 1.0f ? COLOR_ON : COLOR_OFF);
        bRun.setText("AUTO RUN: " + onOff(stAutoRun));
        tint(bRun, stAutoRun ? COLOR_ON : COLOR_OFF);
        bAfk.setText("ANTI AFK: " + onOff(stAntiAfk));
        tint(bAfk, stAntiAfk ? COLOR_ON : COLOR_OFF);
        bHud.setText("GAME HUD: " + onOff(stGameHud));
        tint(bHud, stGameHud ? COLOR_ON : COLOR_OFF);
        bBlur.setText("BLUR FX: " + onOff(stBlur));
        tint(bBlur, stBlur ? COLOR_ON : COLOR_OFF);
        bInfo.setText("INFO HUD: " + onOff(stInfoHud));
        tint(bInfo, stInfoHud ? COLOR_ON : COLOR_OFF);
        bDbg.setText("DEBUG LOG: " + onOff(stDebug));
        tint(bDbg, stDebug ? COLOR_ON : COLOR_OFF);
        bAwake.setText("SCREEN AWAKE: " + onOff(stAwake));
        tint(bAwake, stAwake ? COLOR_ON : COLOR_OFF);
    }

    private static void applyAwake() {
        try { if (handle != null) handle.setKeepScreenOn(stAwake); } catch (Throwable ignored) {}
        try { if (panel != null) panel.setKeepScreenOn(stAwake); } catch (Throwable ignored) {}
        try { if (infoHud != null) infoHud.setKeepScreenOn(stAwake); } catch (Throwable ignored) {}
    }

    private static void applyInfoHud() {
        try {
            if (stInfoHud && !infoShown) {
                WindowManager.LayoutParams p = mkParams(1500, 18);
                p.flags = 8 | 16;
                wm.addView(infoHud, p);
                infoShown = true;
            } else if (!stInfoHud && infoShown) {
                wm.removeView(infoHud);
                infoShown = false;
            }
        } catch (Throwable ignored) {}
    }

    private static String readStatus() {
        BufferedReader in = null;
        try {
            File file = externalFile("br_status.txt");
            if (file == null || !file.isFile()) return "Core is starting…";
            in = new BufferedReader(new FileReader(file));
            String first = in.readLine();
            String second = in.readLine();
            if (first == null) return "Core is starting…";
            return second == null ? first : first + "\n" + second;
        } catch (Throwable ignored) {
            return "Status unavailable";
        } finally {
            try { if (in != null) in.close(); } catch (Throwable ignored) {}
        }
    }

    private static void startStatusUpdates() {
        statusHandler = new Handler(Looper.getMainLooper());
        statusHandler.post(new Runnable() {
            @Override public void run() {
                try {
                    String value = readStatus();
                    if (status != null) status.setText(value);
                    if (infoHud != null) infoHud.setText("BR TEST  •  " + value.replace('\n', ' '));
                } catch (Throwable ignored) {}
                statusHandler.postDelayed(this, 1000L);
            }
        });
    }

    private static void resetAll() {
        stSpeed = 1.0f;
        stAutoRun = false;
        stAntiAfk = false;
        stGameHud = true;
        stBlur = false;
        stInfoHud = false;
        stDebug = false;
        stAwake = true;
        refreshButtons();
        applyInfoHud();
        applyAwake();
        saveCfg();
    }

    private static void buildUi() {
        LinearLayout content = new LinearLayout(appCtx);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setBackgroundColor(Color.parseColor("#F010151D"));
        content.setPadding(20, 14, 20, 16);

        TextView title = new TextView(appCtx);
        title.setText("BR MOD 3  /  PRIVATE TEST");
        title.setTextColor(Color.parseColor("#00E5FF"));
        title.setTextSize(16.0f);
        title.setGravity(Gravity.CENTER);
        addFull(content, title);

        status = new TextView(appCtx);
        status.setText("Core is starting…");
        status.setTextColor(Color.parseColor("#C7D2DA"));
        status.setTextSize(11.5f);
        status.setGravity(Gravity.CENTER);
        status.setPadding(8, 4, 8, 8);
        addFull(content, status);

        Button close = mkBtn("CLOSE", COLOR_ACTION, new Runnable() {
            @Override public void run() {
                try { wm.removeView(panel); panelShown = false; } catch (Throwable ignored) {}
            }
        });
        Button reset = mkBtn("RESET ALL", COLOR_RESET, new Runnable() {
            @Override public void run() { resetAll(); }
        });
        addPair(content, close, reset);

        bSpd = mkBtn("SPEED", COLOR_OFF, new Runnable() {
            @Override public void run() {
                if (stSpeed == 1.0f) stSpeed = 1.5f;
                else if (stSpeed == 1.5f) stSpeed = 2.0f;
                else if (stSpeed == 2.0f) stSpeed = 3.0f;
                else stSpeed = 1.0f;
                refreshButtons(); saveCfg();
            }
        });
        addFull(content, bSpd);

        bRun = mkBtn("AUTO RUN", COLOR_OFF, new Runnable() {
            @Override public void run() { stAutoRun = !stAutoRun; refreshButtons(); saveCfg(); }
        });
        bAfk = mkBtn("ANTI AFK", COLOR_OFF, new Runnable() {
            @Override public void run() { stAntiAfk = !stAntiAfk; refreshButtons(); saveCfg(); }
        });
        addPair(content, bRun, bAfk);

        bHud = mkBtn("GAME HUD", COLOR_OFF, new Runnable() {
            @Override public void run() { stGameHud = !stGameHud; refreshButtons(); saveCfg(); }
        });
        bBlur = mkBtn("BLUR FX", COLOR_OFF, new Runnable() {
            @Override public void run() { stBlur = !stBlur; refreshButtons(); saveCfg(); }
        });
        addPair(content, bHud, bBlur);

        infoHud = new TextView(appCtx);
        infoHud.setTextColor(Color.WHITE);
        infoHud.setTextSize(12.0f);
        infoHud.setBackgroundColor(Color.parseColor("#B010151D"));
        infoHud.setPadding(16, 8, 16, 8);

        bInfo = mkBtn("INFO HUD", COLOR_OFF, new Runnable() {
            @Override public void run() { stInfoHud = !stInfoHud; refreshButtons(); applyInfoHud(); saveCfg(); }
        });
        bDbg = mkBtn("DEBUG LOG", COLOR_OFF, new Runnable() {
            @Override public void run() { stDebug = !stDebug; refreshButtons(); saveCfg(); }
        });
        addPair(content, bInfo, bDbg);

        bAwake = mkBtn("SCREEN AWAKE", COLOR_OFF, new Runnable() {
            @Override public void run() { stAwake = !stAwake; refreshButtons(); applyAwake(); saveCfg(); }
        });
        addFull(content, bAwake);

        TextView note = new TextView(appCtx);
        note.setText("Speed automatically softens steering at x1.5–x3");
        note.setTextColor(Color.parseColor("#78909C"));
        note.setTextSize(10.5f);
        note.setGravity(Gravity.CENTER);
        addFull(content, note);

        ScrollView scroll = new ScrollView(appCtx);
        scroll.setFillViewport(true);
        scroll.addView(content, new ScrollView.LayoutParams(-1, -2));
        panel = scroll;

        handle = mkBtn("[ BR3 ]", Color.parseColor("#DD00A7C4"), new Runnable() {
            @Override public void run() {
                try {
                    if (!panelShown) { wm.addView(panel, mkPanelParams()); panelShown = true; }
                    else { wm.removeView(panel); panelShown = false; }
                } catch (Throwable ignored) {}
            }
        });

        refreshButtons();
        wm.addView(handle, mkParams(30, 250));
        applyInfoHud();
        applyAwake();
    }
}
