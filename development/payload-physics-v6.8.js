// BR MOD physics v8.4 — analog flight control + direct foot speed.
(function () {
    if (globalThis.__brPhysicsV84) return;
    var base = globalThis.__brCoreV4;
    if (base === undefined) return;
    var root = "/sdcard/Android/data/com.br.top/files/";
    var cfgPath = root + "br_cfg.txt";
    var extPath = root + "br_ext.cfg";
    var logPath = root + "br_log.txt";
    var statusPath = root + "br_status.txt";

    var OFF_STAMINA = 0x1A0, OFF_V_FUEL = 0x200, OFF_V_HP = 0x204, OFF_P_HP = 0x1A4;

    var rt = {
        speed: 1.0, jump: 1.0, safeFall: false, endlessRun: false, fly: false,
        waterWalk: false, waterDrive: false, vehicleCruise: false,
        actionSeq: null, brakeUntil: 0,
        god: false, stam: false, fuel: false, fall: false, radar: false, scan: false,
        zUp: false, zDown: false, jack: false, blink: null, jackTarget: null,
        touchAttached: false, active: [false, false, false],
        down: [null, null, null],
        coords: [{x:0,y:0},{x:0,y:0},{x:0,y:0}],
        jumpArmed: true, extLogged: "", writesV: 0, writesP: 0, writesZ: 0, errors: 0
    };
    globalThis.__brPhysicsV84 = rt;

    function log(m) { try { var f = new File(logPath, "a"); f.write("[physics-v8.4] " + m + "\n"); f.flush(); f.close(); } catch (_) {} }
    function readText(p) { try { var f = new File(p, "r"); var v = f.readText(8192) || ""; f.close(); return v; } catch (_) { return ""; } }
    function cfgValue(t, n, fb) { var m = new RegExp("^" + n + "\\s*=\\s*([^\\r\\n]+)", "m").exec(t); return m === null ? fb : m[1].trim(); }
    function factor(v) { var n = parseFloat(v); return n === 1.5 || n === 2.0 || n === 3.0 ? n : 1.0; }

    function readConfig() {
        var t = readText(cfgPath);
        var e = readText(extPath);
        rt.speed = factor(cfgValue(t, "speed", "1.0"));
        rt.jump = factor(cfgValue(t, "jump", "1.0"));
        rt.safeFall = cfgValue(t, "safefall", "0") === "1";
        rt.endlessRun = cfgValue(t, "endlessrun", "0") === "1";
        rt.fly = cfgValue(t, "fly", "0") === "1";
        rt.waterWalk = cfgValue(t, "waterwalk", "0") === "1";
        rt.waterDrive = cfgValue(t, "waterdrive", "0") === "1";
        rt.vehicleCruise = cfgValue(t, "vehiclecruise", "0") === "1";
        var seq = parseInt(cfgValue(t, "action_seq", "0"), 10);
        if (!isFinite(seq)) seq = 0;
        if (rt.actionSeq === null) rt.actionSeq = seq;
        else if (seq !== rt.actionSeq) { rt.actionSeq = seq; if (cfgValue(t, "action", "none") === "brake") rt.brakeUntil = Date.now() + 320; }
        rt.god = cfgValue(e, "godmode", "0") === "1";
        rt.stam = cfgValue(e, "infinitestamina", "0") === "1";
        rt.fuel = cfgValue(e, "infinitefuel", "0") === "1";
        rt.fall = cfgValue(e, "preventfalldmg", "0") === "1";
        rt.radar = cfgValue(e, "radar", "0") === "1";
        rt.scan = cfgValue(e, "scan_offsets", "0") === "1";
        rt.zUp = cfgValue(e, "z_up", "0") === "1";
        rt.zDown = cfgValue(e, "z_down", "0") === "1";
        rt.jack = cfgValue(e, "autojack", "0") === "1";
        var bx = parseFloat(cfgValue(e, "blink_x", "0"));
        var by = parseFloat(cfgValue(e, "blink_y", "0"));
        rt.blink = (bx !== 0 || by !== 0) ? { x: bx, y: by } : null;
        var sig = "god=" + (rt.god?1:0) + " stam=" + (rt.stam?1:0) + " fuel=" + (rt.fuel?1:0) +
                  " fall=" + (rt.fall?1:0) + " radar=" + (rt.radar?1:0) + " jack=" + (rt.jack?1:0);
        if (sig !== rt.extLogged) { rt.extLogged = sig; log("ext cfg " + sig); }
    }

    function attachTouch() {
        if (rt.touchAttached || base.target === null) return;
        var symbol = base.target.findExportByName("Java_com_blackhub_bronline_game_core_JNILib_multiTouchEvent");
        if (symbol === null) return;
        Interceptor.attach(symbol, {
            onEnter: function (args) {
                var action = args[2].toInt32();
                var id = args[3].toInt32();
                if (id < 0 || id > 2) return;
                for (var i = 0; i < 3; i++) {
                    rt.coords[i].x = args[4 + i * 2].toInt32();
                    rt.coords[i].y = args[5 + i * 2].toInt32();
                }
                if (action === 0 || action === 5) { rt.active[id] = true; rt.down[id] = { x: rt.coords[id].x, y: rt.coords[id].y }; }
                else if (action === 1 || action === 3 || action === 6) { rt.active[id] = false; rt.down[id] = null; }
            }
        });
        rt.touchAttached = true;
    }

    function rightHeld() { for (var i = 0; i < 3; i++) if (rt.active[i] && rt.coords[i].x >= 650 && rt.coords[i].y >= 300) return true; return false; }
    function leftHeld() { for (var i = 0; i < 3; i++) if (rt.active[i] && rt.coords[i].x < 650 && rt.coords[i].y >= 300) return true; return false; }

    function leftJoy() {
        for (var i = 0; i < 3; i++) {
            if (rt.active[i] && rt.down[i] !== null && rt.coords[i].x < 650 && rt.coords[i].y >= 300) {
                var dx = rt.coords[i].x - rt.down[i].x;
                var dy = rt.coords[i].y - rt.down[i].y;
                var fwd = Math.max(-1, Math.min(1, -dy / 150));
                var str = Math.max(-1, Math.min(1, dx / 150));
                if (Math.abs(fwd) < 0.08 && Math.abs(str) < 0.08) return { idle: true };
                return { fwd: fwd, str: str };
            }
        }
        return null;
    }

    function selectedEntity() {
        if (base.target === null) return null;
        try {
            var holder = base.target.base.add(0x19d9920).readPointer();
            if (holder.isNull()) return null;
            var index = holder.readU16();
            if (index > 4095) return null;
            var wrapper = base.target.base.add(0x2b2f120 + index * 0xf8).readPointer();
            if (wrapper.isNull()) return null;
            var attached = wrapper.add(0x500).readPointer();
            var vehicle = wrapper.add(0x508).readU8() !== 0 && !attached.isNull();
            var ptrValue = vehicle ? attached : wrapper;
            return { ptr: ptrValue, vehicle: vehicle, key: ptrValue.toString() + (vehicle ? ":v" : ":p") };
        } catch (_) { return null; }
    }

    function playerCap() { return rt.speed <= 1.5 ? 0.55 : (rt.speed <= 2.0 ? 0.72 : 0.92); }
    function vehicleCap() { return rt.speed <= 1.5 ? 0.53 : (rt.speed <= 2.0 ? 0.58 : 0.63); }
    function vehicleStep() { return rt.speed <= 1.5 ? 0.0027 : (rt.speed <= 2.0 ? 0.0039 : 0.0052); }
    function waterCap() { return rt.speed <= 1.0 ? 0.18 : (rt.speed <= 1.5 ? 0.24 : (rt.speed <= 2.0 ? 0.30 : 0.38)); }

    function accelerate(ptrValue, cap, step, counter) {
        var vx = ptrValue.add(0x168).readFloat();
        var vy = ptrValue.add(0x16c).readFloat();
        if (!isFinite(vx) || !isFinite(vy) || Math.abs(vx) > 10 || Math.abs(vy) > 10) return;
        var mag = Math.sqrt(vx * vx + vy * vy);
        if (mag < 0.012 || mag >= cap) return;
        var scale = Math.min(cap, mag + step) / mag;
        ptrValue.add(0x168).writeFloat(vx * scale);
        ptrValue.add(0x16c).writeFloat(vy * scale);
        if (counter === "v") rt.writesV++; else rt.writesP++;
    }

    // v8.4: direct overwrite for foot speed; the game resets ramped values each frame.
    function driveSpeed(ptrValue, cap, counter) {
        var vx = ptrValue.add(0x168).readFloat();
        var vy = ptrValue.add(0x16c).readFloat();
        var hx, hy;
        var mag = Math.sqrt(vx * vx + vy * vy);
        if (mag < 0.012) {
            var d = cameraDirection();
            if (d === null) return;
            var hl = Math.sqrt(d.x * d.x + d.y * d.y);
            if (hl < 0.05) return;
            hx = d.x / hl; hy = d.y / hl;
        } else { hx = vx / mag; hy = vy / mag; }
        ptrValue.add(0x168).writeFloat(hx * cap);
        ptrValue.add(0x16c).writeFloat(hy * cap);
        if (counter === "v") rt.writesV++; else rt.writesP++;
    }

    function steerTo(entity, target, cap) {
        var dx = target.x - entity.x, dy = target.y - entity.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1.0) return true;
        entity.ptr.add(0x168).writeFloat(dx / d * cap);
        entity.ptr.add(0x16c).writeFloat(dy / d * cap);
        return false;
    }

    function cameraDirection() {
        try {
            var scene = base.target.base.add(0x19d9c58).readPointer();
            if (scene.isNull()) return null;
            var camera = scene.add(0x8).readPointer();
            if (camera.isNull()) return null;
            var frame = camera.add(0x8).readPointer();
            if (frame.isNull()) return null;
            var x = frame.add(0x50).readFloat(), y = frame.add(0x54).readFloat(), z = frame.add(0x58).readFloat();
            var len = Math.sqrt(x*x + y*y + z*z);
            if (len < 0.70 || len > 1.30) return null;
            return { x: x/len, y: y/len, z: z/len };
        } catch (_) { return null; }
    }

    function flyVehicle(entity) {
        var p = entity.ptr;
        var vx = p.add(0x168).readFloat(), vy = p.add(0x16c).readFloat(), vz = p.add(0x170).readFloat();
        if (!isFinite(vx) || !isFinite(vy) || !isFinite(vz)) return;
        if (!rightHeld()) {
            if (Math.abs(vx) > 0.002) p.add(0x168).writeFloat(0.0);
            if (Math.abs(vy) > 0.002) p.add(0x16c).writeFloat(0.0);
            if (Math.abs(vz) > 0.002) p.add(0x170).writeFloat(0.0);
            rt.writesZ++;
            return;
        }
        var dir = cameraDirection();
        if (dir === null) { p.add(0x170).writeFloat(0.0); return; }
        var h = Math.min(0.63, vehicleCap());
        p.add(0x168).writeFloat(dir.x * h);
        p.add(0x16c).writeFloat(dir.y * h);
        var vert = rt.zUp ? 0.30 : (rt.zDown ? -0.30 : Math.max(-0.30, Math.min(0.30, dir.z * 0.30)));
        p.add(0x170).writeFloat(vert);
        rt.writesV++; rt.writesZ++;
    }

    // v8.4: analog flight. Joystick = horizontal by camera heading; camera pitch = vertical; no touch = hover.
    function flyPlayer(entity) {
        var p = entity.ptr;
        var vz = p.add(0x170).readFloat();
        if (!isFinite(vz) || Math.abs(vz) > 10) return;
        var dir = cameraDirection();
        var vert = 0.0;
        if (dir !== null) vert = Math.max(-0.30, Math.min(0.30, dir.z * 0.60));
        if (rt.zUp) vert = 0.30;
        if (rt.zDown) vert = -0.30;
        p.add(0x170).writeFloat(vert);
        var js = leftJoy();
        var vx = p.add(0x168).readFloat(), vy = p.add(0x16c).readFloat();
        if (js === null) {
            if (Math.abs(vx) > 0.002) p.add(0x168).writeFloat(0.0);
            if (Math.abs(vy) > 0.002) p.add(0x16c).writeFloat(0.0);
        } else if (!js.idle && dir !== null) {
            var hl = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
            if (hl > 0.05) {
                var fx = dir.x / hl, fy = dir.y / hl;
                var rx = -fy, ry = fx; // if strafe feels mirrored, swap these signs
                var cap = 0.55;
                p.add(0x168).writeFloat((fx * js.fwd + rx * js.str) * cap);
                p.add(0x16c).writeFloat((fy * js.fwd + ry * js.str) * cap);
            }
        }
        rt.writesZ++;
    }

    function verticalPlayer(p) {
        var vz = p.add(0x170).readFloat();
        if (!isFinite(vz) || Math.abs(vz) > 10) return;
        if (rt.waterWalk) { if (Math.abs(vz + 0.055) > 0.002) { p.add(0x170).writeFloat(-0.055); rt.writesZ++; } return; }
        if (rt.fall && vz < -0.12) { p.add(0x170).writeFloat(-0.12); rt.writesZ++; return; }
        if (vz <= 0.008) rt.jumpArmed = true;
        if (rt.jump > 1.0 && rt.jumpArmed && vz > 0.020) {
            var mult = rt.jump <= 1.5 ? 2.2 : (rt.jump <= 2.0 ? 2.8 : 3.5);
            var cap = rt.jump <= 1.5 ? 0.48 : (rt.jump <= 2.0 ? 0.66 : 0.86);
            p.add(0x170).writeFloat(Math.min(cap, vz * mult));
            rt.jumpArmed = false;
            rt.writesZ++;
        } else if (rt.safeFall && vz < -0.18) { p.add(0x170).writeFloat(-0.12); rt.writesZ++; }
    }

    function scanEntities() {
        if (base.target === null) return [];
        var out = [];
        try {
            var holder = base.target.base.add(0x19d9920).readPointer();
            if (holder.isNull()) return out;
            for (var i = 0; i < 100; i++) {
                var w = base.target.base.add(0x2b2f120 + i * 0xf8).readPointer();
                if (w.isNull()) continue;
                var x = w.add(0x38).readFloat(), y = w.add(0x3c).readFloat(), z = w.add(0x40).readFloat();
                var veh = w.add(0x508).readU8() !== 0 && !w.add(0x500).readPointer().isNull();
                if (isFinite(x) && isFinite(y) && isFinite(z)) out.push({ ptr: w, x: x, y: y, z: z, vehicle: veh });
            }
        } catch (_) {}
        return out;
    }

    function findNearestVehicle(me) {
        var all = scanEntities(), best = null, bd = 9999;
        for (var i = 0; i < all.length; i++) {
            if (!all[i].vehicle) continue;
            var d = Math.sqrt(Math.pow(all[i].x - me.x, 2) + Math.pow(all[i].y - me.y, 2));
            if (d < bd && d > 2.0) { bd = d; best = all[i]; }
        }
        return best;
    }

    function updateRadar() {
        if (!rt.radar) return;
        var all = scanEntities();
        try {
            var f = new File(statusPath, "w");
            f.write("RADAR: " + all.length + "\n");
            var c = 0;
            for (var i = 0; i < all.length && c < 5; i++) {
                if (!all[i].vehicle) { f.write("P" + c + ": " + all[i].x.toFixed(0) + "," + all[i].y.toFixed(0) + "\n"); c++; }
            }
            f.flush(); f.close();
        } catch (_) {}
    }

    function scanOffsets(entity) {
        log("offset scan start");
        try {
            for (var o = 0; o < 0x400; o += 4) {
                var v = entity.ptr.add(o).readFloat();
                if (isFinite(v) && v === 100.0) log("FOUND 100.0 at 0x" + o.toString(16));
            }
        } catch (_) {}
    }

    function freezeResources(entity) {
        if (!entity) return;
        if (!entity.vehicle) {
            if (rt.god) { try { entity.ptr.add(OFF_P_HP).writeFloat(100.0); } catch (_) {} }
            if (rt.stam) { try { entity.ptr.add(OFF_STAMINA).writeFloat(100.0); } catch (_) {} }
        } else {
            if (rt.god) { try { entity.ptr.add(OFF_V_HP).writeFloat(100.0); } catch (_) {} }
            if (rt.fuel) { try { entity.ptr.add(OFF_V_FUEL).writeFloat(100.0); } catch (_) {} }
        }
    }

    function tick() {
        var active = rt.speed > 1.0 || rt.jump > 1.0 || rt.safeFall || rt.endlessRun || rt.fly ||
            rt.waterWalk || rt.waterDrive || rt.vehicleCruise || Date.now() < rt.brakeUntil ||
            rt.god || rt.stam || rt.fuel || rt.fall || rt.jack || rt.blink !== null || rt.zUp || rt.zDown;
        if (!active) return;
        var entity = selectedEntity();
        if (entity === null) return;
        try {
            freezeResources(entity);
            if (entity.vehicle) {
                if (rt.fly) { flyVehicle(entity); return; }
                if (Date.now() < rt.brakeUntil) {
                    entity.ptr.add(0x168).writeFloat(0.0);
                    entity.ptr.add(0x16c).writeFloat(0.0);
                    rt.writesV++;
                    return;
                }
                if (rt.waterDrive) { entity.ptr.add(0x170).writeFloat(0.0); rt.writesZ++; }
                if (rt.jackTarget) { if (steerTo(entity, rt.jackTarget, 0.63)) rt.jackTarget = null; }
                else if (rt.blink) { if (steerTo(entity, rt.blink, 0.63)) rt.blink = null; }
                else if (rightHeld()) accelerate(entity.ptr, vehicleCap(), vehicleStep(), "v");
                else if (rt.vehicleCruise) accelerate(entity.ptr, 0.38, 0.0012, "v");
            } else {
                if (rt.fly) flyPlayer(entity);
                else verticalPlayer(entity.ptr);
                if (rt.jack && rt.jackTarget === null) rt.jackTarget = findNearestVehicle(entity);
                if (!rt.jack) rt.jackTarget = null;
                if (rt.jackTarget) { if (steerTo(entity, rt.jackTarget, playerCap())) { rt.jackTarget = null; log("jack arrived"); } }
                else if (rt.blink) { if (steerTo(entity, rt.blink, playerCap())) rt.blink = null; }
                else if (leftHeld()) {
                    if (rt.waterWalk) driveSpeed(entity.ptr, waterCap(), "p");
                    else if (rt.speed > 1.0) driveSpeed(entity.ptr, playerCap(), "p");
                    else if (rt.endlessRun) accelerate(entity.ptr, 0.105, 0.0008, "p");
                }
            }
        } catch (error) {
            rt.errors++;
            if (rt.errors <= 3) log("error=" + error);
        }
    }

    var scanDone = false;
    readConfig();
    attachTouch();
    setInterval(readConfig, 500);
    setInterval(attachTouch, 500);
    setInterval(tick, 20);
    setInterval(updateRadar, 1000);
    setInterval(function () {
        if (rt.scan && !scanDone) { scanDone = true; var e = selectedEntity(); if (e) scanOffsets(e); }
        if (!rt.scan) scanDone = false;
        if (rt.writesV || rt.writesP || rt.writesZ || rt.errors) {
            log("writes10s vehicle=" + rt.writesV + " player=" + rt.writesP + " vertical=" + rt.writesZ + " errors=" + rt.errors);
            rt.writesV = 0; rt.writesP = 0; rt.writesZ = 0;
        }
    }, 10000);
    log("physics v8.4 loaded; analog flight + direct foot speed");
})();