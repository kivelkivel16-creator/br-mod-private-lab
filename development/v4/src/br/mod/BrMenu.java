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

/** Owner-only controls for private Black Russia test server. */
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

    private static Button bSpeed;
    private static Button bJump;
    private static Button bFall;
    private static Button bRun;
    private static Button bFreeze;
    private static Button bFly;
    private static Button bWaterWalk;
    private static Button bWaterDrive;
    private static Button bVehicleCruise;
    private static Button bAfk;
    private static Button bHud;
    private static Button bInfo;
    private static Button bAwake;
    private static Button bGod;
    private static Button bStam;
    private static Button bFuel;
    private static Button bFallProt;
    private static Button bRadar;
    private static Button bJack;
    private static Button bZUp;
    private static Button bZDown;

    private static float stSpeed = 1.0f;
    private static float stJump = 1.0f;
    private static boolean stSafeFall;
    private static boolean stEndlessRun;
    private static boolean stNoFreeze;
    private static boolean stFly;
    private static boolean stWaterWalk;
    private static boolean stWaterDrive;
    private static boolean stVehicleCruise;
    private static boolean stAntiAfk;
    private static boolean stGameHud = true;
    private static boolean stInfoHud;
    private static boolean stAwake = true;
    private static int stActionSeq;
    private static String stAction = "none";
    private static boolean stGod;
    private static boolean stStam;
    private static boolean stFuel;
    private static boolean stFallProt;
    private static boolean stRadar;
    private static boolean stJack;
    private static boolean stZUp;
    private static boolean stZDown;
    private static Handler statusHandler;

    private BrMenu() {}

    public static void init(Context context) {
        try {
            if (handle != null) return;
            appCtx = context.getApplicationContext();
            wm = (WindowManager) appCtx.getSystemService(Context.WINDOW_SERVICE);
            loadCfg();
            loadExt();
            buildUi();
            saveCfg();
            startStatusUpdates();
        } catch (Throwable ignored) {}
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
        WindowManager.LayoutParams p = mkParams(40, 95);
        p.width = 710;
        p.height = 610;
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

    private static boolean allowedFactor(float value) {
        return value == 1.0f || value == 1.5f || value == 2.0f || value == 3.0f;
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
                if ("speed".equals(key)) {
                    try { stSpeed = Float.parseFloat(value); } catch (Throwable ignored) {}
                } else if ("jump".equals(key)) {
                    try { stJump = Float.parseFloat(value); } catch (Throwable ignored) {}
                } else if ("safefall".equals(key)) stSafeFall = "1".equals(value);
                else if ("endlessrun".equals(key)) stEndlessRun = "1".equals(value);
                else if ("nofreeze".equals(key)) stNoFreeze = "1".equals(value);
                else if ("fly".equals(key)) stFly = "1".equals(value);
                else if ("waterwalk".equals(key)) stWaterWalk = "1".equals(value);
                else if ("waterdrive".equals(key)) stWaterDrive = "1".equals(value);
                else if ("vehiclecruise".equals(key)) stVehicleCruise = "1".equals(value);
                else if ("antiafk".equals(key)) stAntiAfk = "1".equals(value);
                else if ("gamehud".equals(key) || "draw2d".equals(key)) stGameHud = "1".equals(value);
                else if ("infohud".equals(key)) stInfoHud = "1".equals(value);
                else if ("awake".equals(key)) stAwake = "1".equals(value);
                else if ("action_seq".equals(key)) {
                    try { stActionSeq = Integer.parseInt(value); } catch (Throwable ignored) {}
                }
            }
        } catch (Throwable ignored) {
        } finally {
            try { if (in != null) in.close(); } catch (Throwable ignored) {}
        }
        if (!allowedFactor(stSpeed)) stSpeed = 1.0f;
        if (!allowedFactor(stJump)) stJump = 1.0f;
    }

    private static void loadExt() {
        BufferedReader in = null;
        try {
            File file = externalFile("br_ext.cfg");
            if (file == null || !file.isFile()) return;
            in = new BufferedReader(new FileReader(file));
            String line;
            while ((line = in.readLine()) != null) {
                int split = line.indexOf('=');
                if (split <= 0) continue;
                String key = line.substring(0, split).trim();
                String value = line.substring(split + 1).trim();
                if ("godmode".equals(key)) stGod = "1".equals(value);
                else if ("infinitestamina".equals(key)) stStam = "1".equals(value);
                else if ("infinitefuel".equals(key)) stFuel = "1".equals(value);
                else if ("preventfalldmg".equals(key)) stFallProt = "1".equals(value);
                else if ("radar".equals(key)) stRadar = "1".equals(value);
                else if ("autojack".equals(key)) stJack = "1".equals(value);
                else if ("z_up".equals(key)) stZUp = "1".equals(value);
                else if ("z_down".equals(key)) stZDown = "1".equals(value);
            }
        } catch (Throwable ignored) {
        } finally {
            try { if (in != null) in.close(); } catch (Throwable ignored) {}
        }
    }

    private static void saveCfg() {
        FileWriter out = null;
        try {
            File file = externalFile("br_cfg.txt");
            if (file == null) return;
            out = new FileWriter(file, false);
            out.write("core=6\n");
            out.write("speed=" + stSpeed + "\n");
            out.write("jump=" + stJump + "\n");
            out.write("safefall=" + (stSafeFall ? 1 : 0) + "\n");
            out.write("endlessrun=" + (stEndlessRun ? 1 : 0) + "\n");
            out.write("nofreeze=" + (stNoFreeze ? 1 : 0) + "\n");
            out.write("fly=" + (stFly ? 1 : 0) + "\n");
            out.write("waterwalk=" + (stWaterWalk ? 1 : 0) + "\n");
            out.write("waterdrive=" + (stWaterDrive ? 1 : 0) + "\n");
            out.write("vehiclecruise=" + (stVehicleCruise ? 1 : 0) + "\n");
            out.write("antiafk=" + (stAntiAfk ? 1 : 0) + "\n");
            out.write("gamehud=" + (stGameHud ? 1 : 0) + "\n");
            out.write("infohud=" + (stInfoHud ? 1 : 0) + "\n");
            out.write("awake=" + (stAwake ? 1 : 0) + "\n");
            out.write("action=" + stAction + "\n");
            out.write("action_seq=" + stActionSeq + "\n");
            out.write("autorun=0\nblur=0\ndebug=0\n");
            out.flush();
        } catch (Throwable ignored) {
        } finally {
            try { if (out != null) out.close(); } catch (Throwable ignored) {}
        }
    }

    private static void saveExt() {
        FileWriter out = null;
        try {
            File file = externalFile("br_ext.cfg");
            if (file == null) return;
            out = new FileWriter(file, false);
            out.write("godmode=" + (stGod ? 1 : 0) + "\n");
            out.write("infinitestamina=" + (stStam ? 1 : 0) + "\n");
            out.write("infinitefuel=" + (stFuel ? 1 : 0) + "\n");
            out.write("preventfalldmg=" + (stFallProt ? 1 : 0) + "\n");
            out.write("radar=" + (stRadar ? 1 : 0) + "\n");
            out.write("autojack=" + (stJack ? 1 : 0) + "\n");
            out.write("z_up=" + (stZUp ? 1 : 0) + "\n");
            out.write("z_down=" + (stZDown ? 1 : 0) + "\n");
            out.flush();
        } catch (Throwable ignored) {
        } finally {
            try { if (out != null) out.close(); } catch (Throwable ignored) {}
        }
    }

    private static String onOff(boolean value) { return value ? "ВКЛ" : "ВЫКЛ"; }

    private static void refreshButtons() {
        if (bSpeed == null) return;
        bSpeed.setText("СКОРОСТЬ: x" + stSpeed + (stSpeed > 1.0f ? "  •  АВТО-СГЛАЖИВАНИЕ" : ""));
        tint(bSpeed, stSpeed > 1.0f ? COLOR_ON : COLOR_OFF);
        bJump.setText("УСИЛЕНИЕ ПРЫЖКА: x" + stJump);
        tint(bJump, stJump > 1.0f ? COLOR_ON : COLOR_OFF);
        bFall.setText("БЕЗОПАСНОЕ ПАДЕНИЕ: " + onOff(stSafeFall));
        tint(bFall, stSafeFall ? COLOR_ON : COLOR_OFF);
        bRun.setText("БЕСКОНЕЧНЫЙ БЕГ: " + onOff(stEndlessRun));
        tint(bRun, stEndlessRun ? COLOR_ON : COLOR_OFF);
        bFreeze.setText("АНТИ-ЗАМОРОЗКА: " + onOff(stNoFreeze));
        tint(bFreeze, stNoFreeze ? COLOR_ON : COLOR_OFF);
        bFly.setText("ПОЛЁТ / ХОДЬБА В ВОЗДУХЕ: " + onOff(stFly));
        tint(bFly, stFly ? COLOR_ON : COLOR_OFF);
        bWaterWalk.setText("ХОДИТЬ ПОД ВОДОЙ: " + onOff(stWaterWalk));
        tint(bWaterWalk, stWaterWalk ? COLOR_ON : COLOR_OFF);
        bWaterDrive.setText("ЕЗДИТЬ ПОД ВОДОЙ: " + onOff(stWaterDrive));
        tint(bWaterDrive, stWaterDrive ? COLOR_ON : COLOR_OFF);
        bVehicleCruise.setText("ПОДДЕРЖКА ДВИЖЕНИЯ: " + onOff(stVehicleCruise));
        tint(bVehicleCruise, stVehicleCruise ? COLOR_ON : COLOR_OFF);
        bAfk.setText("АНТИ-AFK: " + onOff(stAntiAfk));
        tint(bAfk, stAntiAfk ? COLOR_ON : COLOR_OFF);
        bHud.setText("ИНТЕРФЕЙС ИГРЫ: " + onOff(stGameHud));
        tint(bHud, stGameHud ? COLOR_ON : COLOR_OFF);
        bInfo.setText("ИНФО-ПАНЕЛЬ: " + onOff(stInfoHud));
        tint(bInfo, stInfoHud ? COLOR_ON : COLOR_OFF);
        bAwake.setText("НЕ ГАСИТЬ ЭКРАН: " + onOff(stAwake));
        tint(bAwake, stAwake ? COLOR_ON : COLOR_OFF);
        bGod.setText("БЕССМЕРТИЕ: " + onOff(stGod));
        tint(bGod, stGod ? COLOR_ON : COLOR_OFF);
        bStam.setText("БЕСКОНЕЧНАЯ СТАМИНА: " + onOff(stStam));
        tint(bStam, stStam ? COLOR_ON : COLOR_OFF);
        bFuel.setText("БЕСКОНЕЧНОЕ ТОПЛИВО: " + onOff(stFuel));
        tint(bFuel, stFuel ? COLOR_ON : COLOR_OFF);
        bFallProt.setText("АНТИ-УРОН ПАДЕНИЯ: " + onOff(stFallProt));
        tint(bFallProt, stFallProt ? COLOR_ON : COLOR_OFF);
        bRadar.setText("РАДАР: " + onOff(stRadar));
        tint(bRadar, stRadar ? COLOR_ON : COLOR_OFF);
        bJack.setText("МАГНИТ МАШИНЫ: " + onOff(stJack));
        tint(bJack, stJack ? COLOR_ON : COLOR_OFF);
        bZUp.setText("ВВЕРХ (ВЫСОТА): " + onOff(stZUp));
        tint(bZUp, stZUp ? COLOR_ON : COLOR_OFF);
        bZDown.setText("ВНИЗ (ВЫСОТА): " + onOff(stZDown));
        tint(bZDown, stZDown ? COLOR_ON : COLOR_OFF);
    }

    private static float nextFactor(float value) {
        if (value == 1.0f) return 1.5f;
        if (value == 1.5f) return 2.0f;
        if (value == 2.0f) return 3.0f;
        return 1.0f;
    }

    private static void sendAction(String action) {
        stAction = action;
        stActionSeq++;
        saveCfg();
    }

    private static void applyAwake() {
        try { if (handle != null) handle.setKeepScreenOn(stAwake); } catch (Throwable ignored) {}
        try { if (panel != null) panel.setKeepScreenOn(stAwake); } catch (Throwable ignored) {}
        try { if (infoHud != null) infoHud.setKeepScreenOn(stAwake); } catch (Throwable ignored) {}
    }

    private static void applyInfoHud() {
        try {
            if (stInfoHud && !infoShown) {
                WindowManager.LayoutParams p = mkParams(1320, 18);
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
            if (file == null || !file.isFile()) return "Ядро v8.4 запускается...";
            in = new BufferedReader(new FileReader(file));
            StringBuilder value = new StringBuilder();
            String line;
            int count = 0;
            while (count < 3 && (line = in.readLine()) != null) {
                if (count > 0) value.append('\n');
                value.append(line);
                count++;
            }
            return value.length() == 0 ? "Ядро v8.4 запускается..." : value.toString();
        } catch (Throwable ignored) {
            return "Статус недоступен";
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
                    if (infoHud != null) infoHud.setText("BR ТЕСТ  •  " + value.replace('\n', ' '));
                } catch (Throwable ignored) {}
                statusHandler.postDelayed(this, 1000L);
            }
        });
    }

    private static void resetAll() {
        stSpeed = 1.0f;
        stJump = 1.0f;
        stSafeFall = false;
        stEndlessRun = false;
        stNoFreeze = false;
        stFly = false;
        stWaterWalk = false;
        stWaterDrive = false;
        stVehicleCruise = false;
        stAntiAfk = false;
        stGameHud = true;
        stInfoHud = false;
        stAwake = true;
        stAction = "none";
        stGod = false;
        stStam = false;
        stFuel = false;
        stFallProt = false;
        stRadar = false;
        stJack = false;
        stZUp = false;
        stZDown = false;
        refreshButtons();
        applyInfoHud();
        applyAwake();
        saveCfg();
        saveExt();
    }

    private static void buildUi() {
        LinearLayout content = new LinearLayout(appCtx);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setBackgroundColor(Color.parseColor("#F010151D"));
        content.setPadding(20, 14, 20, 16);

        TextView title = new TextView(appCtx);
        title.setText("BR MOD 8.4  /  ПРИВАТНЫЙ ТЕСТ");
        title.setTextColor(Color.parseColor("#00E5FF"));
        title.setTextSize(16.0f);
        title.setGravity(Gravity.CENTER);
        addFull(content, title);

        status = new TextView(appCtx);
        status.setText("Ядро v8.4 запускается...");
        status.setTextColor(Color.parseColor("#C7D2DA"));
        status.setTextSize(11.5f);
        status.setGravity(Gravity.CENTER);
        status.setPadding(8, 4, 8, 8);
        addFull(content, status);

        Button close = mkBtn("ЗАКРЫТЬ", COLOR_ACTION, new Runnable() {
            @Override public void run() {
                try { wm.removeView(panel); panelShown = false; } catch (Throwable ignored) {}
            }
        });
        Button reset = mkBtn("СБРОСИТЬ ВСЁ", COLOR_RESET, new Runnable() {
            @Override public void run() { resetAll(); }
        });
        addPair(content, close, reset);

        bSpeed = mkBtn("СКОРОСТЬ", COLOR_OFF, new Runnable() {
            @Override public void run() { stSpeed = nextFactor(stSpeed); refreshButtons(); saveCfg(); }
        });
        addFull(content, bSpeed);

        bJump = mkBtn("УСИЛЕНИЕ ПРЫЖКА", COLOR_OFF, new Runnable() {
            @Override public void run() { stJump = nextFactor(stJump); refreshButtons(); saveCfg(); }
        });
        bFall = mkBtn("БЕЗОПАСНОЕ ПАДЕНИЕ", COLOR_OFF, new Runnable() {
            @Override public void run() { stSafeFall = !stSafeFall; refreshButtons(); saveCfg(); }
        });
        addPair(content, bJump, bFall);

        bRun = mkBtn("БЕСКОНЕЧНЫЙ БЕГ", COLOR_OFF, new Runnable() {
            @Override public void run() { stEndlessRun = !stEndlessRun; refreshButtons(); saveCfg(); }
        });
        bFreeze = mkBtn("АНТИ-ЗАМОРОЗКА", COLOR_OFF, new Runnable() {
            @Override public void run() { stNoFreeze = !stNoFreeze; refreshButtons(); saveCfg(); }
        });
        addPair(content, bRun, bFreeze);

        bFly = mkBtn("ПОЛЁТ / ХОДЬБА В ВОЗДУХЕ", COLOR_OFF, new Runnable() {
            @Override public void run() { stFly = !stFly; refreshButtons(); saveCfg(); }
        });
        bWaterWalk = mkBtn("ХОДИТЬ ПОД ВОДОЙ", COLOR_OFF, new Runnable() {
            @Override public void run() { stWaterWalk = !stWaterWalk; refreshButtons(); saveCfg(); }
        });
        addPair(content, bFly, bWaterWalk);

        bWaterDrive = mkBtn("ЕЗДИТЬ ПОД ВОДОЙ", COLOR_OFF, new Runnable() {
            @Override public void run() { stWaterDrive = !stWaterDrive; refreshButtons(); saveCfg(); }
        });
        bVehicleCruise = mkBtn("ПОДДЕРЖКА ДВИЖЕНИЯ", COLOR_OFF, new Runnable() {
            @Override public void run() { stVehicleCruise = !stVehicleCruise; refreshButtons(); saveCfg(); }
        });
        addPair(content, bWaterDrive, bVehicleCruise);

        bGod = mkBtn("БЕССМЕРТИЕ", COLOR_OFF, new Runnable() {
            @Override public void run() { stGod = !stGod; refreshButtons(); saveExt(); }
        });
        bStam = mkBtn("БЕСКОНЕЧНАЯ СТАМИНА", COLOR_OFF, new Runnable() {
            @Override public void run() { stStam = !stStam; refreshButtons(); saveExt(); }
        });
        addPair(content, bGod, bStam);

        bFuel = mkBtn("БЕСКОНЕЧНОЕ ТОПЛИВО", COLOR_OFF, new Runnable() {
            @Override public void run() { stFuel = !stFuel; refreshButtons(); saveExt(); }
        });
        bFallProt = mkBtn("АНТИ-УРОН ПАДЕНИЯ", COLOR_OFF, new Runnable() {
            @Override public void run() { stFallProt = !stFallProt; refreshButtons(); saveExt(); }
        });
        addPair(content, bFuel, bFallProt);

        bRadar = mkBtn("РАДАР", COLOR_OFF, new Runnable() {
            @Override public void run() { stRadar = !stRadar; refreshButtons(); saveExt(); }
        });
        bJack = mkBtn("МАГНИТ МАШИНЫ", COLOR_OFF, new Runnable() {
            @Override public void run() { stJack = !stJack; refreshButtons(); saveExt(); }
        });
        addPair(content, bRadar, bJack);

        bZUp = mkBtn("ВВЕРХ (ВЫСОТА)", COLOR_OFF, new Runnable() {
            @Override public void run() { stZUp = !stZUp; if (stZUp) stZDown = false; refreshButtons(); saveExt(); }
        });
        bZDown = mkBtn("ВНИЗ (ВЫСОТА)", COLOR_OFF, new Runnable() {
            @Override public void run() { stZDown = !stZDown; if (stZDown) stZUp = false; refreshButtons(); saveExt(); }
        });
        addPair(content, bZUp, bZDown);

        Button up = mkBtn("ВВЕРХ: ИГРОК / МАШИНА", COLOR_ACTION, new Runnable() {
            @Override public void run() { sendAction("up"); }
        });
        Button down = mkBtn("ВНИЗ: ИГРОК / МАШИНА", COLOR_ACTION, new Runnable() {
            @Override public void run() { sendAction("down"); }
        });
        addPair(content, up, down);

        Button brake = mkBtn("БЫСТРЫЙ ТОРМОЗ", COLOR_ACTION, new Runnable() {
            @Override public void run() { sendAction("brake"); }
        });
        addFull(content, brake);

        bAfk = mkBtn("АНТИ-AFK", COLOR_OFF, new Runnable() {
            @Override public void run() { stAntiAfk = !stAntiAfk; refreshButtons(); saveCfg(); }
        });
        bHud = mkBtn("ИНТЕРФЕЙС ИГРЫ", COLOR_OFF, new Runnable() {
            @Override public void run() { stGameHud = !stGameHud; refreshButtons(); saveCfg(); }
        });
        addPair(content, bAfk, bHud);

        infoHud = new TextView(appCtx);
        infoHud.setTextColor(Color.WHITE);
        infoHud.setTextSize(12.0f);
        infoHud.setBackgroundColor(Color.parseColor("#B010151D"));
        infoHud.setPadding(16, 8, 16, 8);

        bInfo = mkBtn("ИНФО-ПАНЕЛЬ", COLOR_OFF, new Runnable() {
            @Override public void run() { stInfoHud = !stInfoHud; refreshButtons(); applyInfoHud(); saveCfg(); }
        });
        bAwake = mkBtn("НЕ ГАСИТЬ ЭКРАН", COLOR_OFF, new Runnable() {
            @Override public void run() { stAwake = !stAwake; refreshButtons(); applyAwake(); saveCfg(); }
        });
        addPair(content, bInfo, bAwake);

        TextView note = new TextView(appCtx);
        note.setText("Только свой персонаж и текущая машина. Функции включайте по одной.");
        note.setTextColor(Color.parseColor("#78909C"));
        note.setTextSize(10.5f);
        note.setGravity(Gravity.CENTER);
        addFull(content, note);

        ScrollView scroll = new ScrollView(appCtx);
        scroll.setFillViewport(true);
        scroll.addView(content, new ScrollView.LayoutParams(-1, -2));
        panel = scroll;

        handle = mkBtn("[ BR8.4 ]", Color.parseColor("#DD00A7C4"), new Runnable() {
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