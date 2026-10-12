// ============================================================
//  Turret Auto Fill (mobile) - Mindustry v8 (Rhino JS)
//  Idea and approach: Turretautofill by Vini230909, with an on-screen button for mobile.
//  Works only on the player's side, as if you carried ammo by hand:
//  takes ammo from the core, puts it into the emptiest nearby turret, returns what you held.
//  Safe for multiplayer on regular servers (the server does not need the mod).
// ============================================================

const PERIOD = 24;         // одно действие раз в столько тиков (24 тика = 15 действий за 6 секунд)
const MIN_STOCK = 0;       // не брать из ядра предмет, если его не больше этого (0 = брать любое количество)
const ItemTurret = Packages.mindustry.world.blocks.defense.turrets.ItemTurret;
const TextureRegionDrawable = Packages.arc.scene.style.TextureRegionDrawable;
const Touchable = Packages.arc.scene.event.Touchable;
const TrigType = (typeof Trigger !== "undefined") ? Trigger : Packages.mindustry.game.EventType$Trigger;
const SKEY = "tafm_cfg";

// ---------- настройки (хранятся в настройках игры на этом устройстве) ----------

let cfg = { fx: 0.01, fy: 0.22, scale: 100, prio: {}, lang: null };
function loadCfg() {
    try {
        const s = Core.settings.getString(SKEY, "");
        if (s) {
            const c = JSON.parse(String(s));
            if (typeof c.fx === "number") cfg.fx = c.fx;
            if (typeof c.fy === "number") cfg.fy = c.fy;
            if (typeof c.scale === "number") cfg.scale = c.scale;
            if (c.prio && typeof c.prio === "object") cfg.prio = c.prio;
            if (c.lang === "ru" || c.lang === "en") cfg.lang = c.lang;
        }
    } catch (e) { Log.err("[TurretAutoFill] настройки: " + e); }
}
const prioCache = {};
function saveCfg() {
    try { Core.settings.put(SKEY, new Packages.java.lang.String(JSON.stringify(cfg))); } catch (e) { Log.err("[TurretAutoFill] сохранение: " + e); }
}
loadCfg();

// ---------- language / язык ----------

function defaultLang() {
    try { if (String(Core.settings.getString("locale", "")).indexOf("ru") == 0) return "ru"; } catch (e) { }
    try { if (String(Core.bundle.getLocale().getLanguage()) == "ru") return "ru"; } catch (e) { }
    return "en";
}
if (cfg.lang !== "ru" && cfg.lang !== "en") cfg.lang = defaultLang();

const STR = {
    title:    { ru: "Turret Auto Fill (mobile)", en: "Turret Auto Fill (mobile)" },
    language: { ru: "Язык мода", en: "Mod language" },
    btnHead:  { ru: "Кнопка на экране", en: "On-screen button" },
    size:     { ru: "Размер: ", en: "Size: " },
    move:     { ru: "Переместить кнопку", en: "Move button" },
    reset:    { ru: "Сбросить", en: "Reset" },
    prio:     { ru: "Приоритет патронов (сверху - первым; «Вкл» - разрешено ли использовать)", en: "Ammo priority (top = first; \"On\" = allowed to use)" },
    def:      { ru: "По умолчанию", en: "Default" },
    on:       { ru: "Вкл", en: "On" },
    btnOn:    { ru: "Подача: ВКЛ", en: "Feed: ON" },
    btnOff:   { ru: "Подача: выкл", en: "Feed: off" },
    drag:     { ru: "Тащи меня", en: "Drag me" },
    toastOn:  { ru: "[accent]Автоподача патронов включена[]", en: "[accent]Turret auto fill enabled[]" },
    toastOff: { ru: "Автоподача патронов выключена", en: "Turret auto fill disabled" },
    notInGame:{ ru: "Это работает только во время игры: зайди в игру и зажми кнопку подачи (долгое нажатие)", en: "Only works in-game: enter a game and long-press the feed button" },
    dragHint: { ru: "Тащи кнопку пальцем. Коснись её без движения, когда закончишь.", en: "Drag the button with your finger. Tap it without moving when done." }
};
function T(k) { const e = STR[k]; return e ? e[cfg.lang] : k; }

// Названия турелей и предметов на выбранном языке мода (если нет в списке - берём название из игры)
const BLOCK_NAMES = {
    en: { "duo": "Duo", "scatter": "Scatter", "scorch": "Scorch", "hail": "Hail", "swarmer": "Swarmer", "salvo": "Salvo", "fuse": "Fuse",
          "ripple": "Ripple", "cyclone": "Cyclone", "foreshadow": "Foreshadow", "spectre": "Spectre",
          "breach": "Breach", "diffuse": "Diffuse", "titan": "Titan", "disperse": "Disperse", "scathe": "Scathe", "smite": "Smite" },
    ru: { "duo": "Двойная турель", "scatter": "Рассеиватель", "scorch": "Обжигатель", "hail": "Град", "swarmer": "Роевик", "salvo": "Залп",
          "fuse": "Взрыватель", "ripple": "Рябь", "cyclone": "Циклон", "foreshadow": "Знамение" }
};
const ITEM_NAMES = {
    en: { "copper": "Copper", "lead": "Lead", "metaglass": "Metaglass", "graphite": "Graphite", "sand": "Sand", "coal": "Coal",
          "titanium": "Titanium", "thorium": "Thorium", "scrap": "Scrap", "silicon": "Silicon", "plastanium": "Plastanium",
          "phase-fabric": "Phase Fabric", "surge-alloy": "Surge Alloy", "spore-pod": "Spore Pod", "blast-compound": "Blast Compound",
          "pyratite": "Pyratite", "beryllium": "Beryllium", "tungsten": "Tungsten", "oxide": "Oxide", "carbide": "Carbide" },
    ru: { "copper": "Медь", "lead": "Свинец", "metaglass": "Метастекло", "graphite": "Графит", "sand": "Песок", "coal": "Уголь",
          "titanium": "Титан", "thorium": "Торий", "scrap": "Металлолом", "silicon": "Кремний", "pyratite": "Пиротит" }
};
function blockName(b) { const m = BLOCK_NAMES[cfg.lang]; return (m && m[b.name]) || b.localizedName; }
function itemName(it, fallback) { if (!it) return fallback; const m = ITEM_NAMES[cfg.lang]; return (m && m[it.name]) || it.localizedName; }

// ---------- приоритет патронов ----------

function dps(bt) {
    try { const d = bt.estimateDPS(); if (d > 0) return d; } catch (e) { }
    try { return bt.damage + bt.splashDamage; } catch (e) { return 0; }
}

function defaultOrder(block) {
    const arr = [];
    block.ammoTypes.keys().toSeq().each(item => {         // тот же способ перебора, что работал раньше
        let d = 0;
        try { d = dps(block.ammoTypes.get(item)); } catch (e) { }
        arr.push({ i: item.name, d: d });
    });
    arr.sort((a, b) => (b.d - a.d) || 0);                          // по умолчанию: сильнее (по оценке урона) — выше
    return arr.map(x => ({ i: x.i, on: true }));
}

function getPrio(block) {
    if (prioCache[block.name]) return prioCache[block.name];
    const def = defaultOrder(block);
    const valid = {};
    def.forEach(e => { valid[e.i] = true; });
    const res = [], seen = {};
    const saved = cfg.prio[block.name];
    if (Array.isArray(saved)) saved.forEach(e => { if (e && valid[e.i] && !seen[e.i]) { seen[e.i] = true; res.push({ i: e.i, on: e.on !== false }); } });
    def.forEach(e => { if (!seen[e.i]) res.push(e); });     // новые виды патронов — в конец
    prioCache[block.name] = res;
    return res;
}

function setPrio(block, list) {
    cfg.prio[block.name] = list.map(e => ({ i: e.i, on: e.on }));
    prioCache[block.name] = null;
    saveCfg();
}

// ---------- сама подача ----------

let on = false;
let lastReq = null;        // что мы сами взяли из ядра для турелей
let held = null;           // то, что лежало у тебя в руках до подачи: { item, amount }
let status = "";          // что сейчас делает мод (показывается на кнопке)
let tick = 0;
let errLogged = false;

function range() { return Vars.itemTransferRange; }

function turretsNear(u) {
    const list = [];
    Vars.indexer.eachBlock(u.team, u.x, u.y, range(), b => b.block instanceof ItemTurret, b => { list.push(b); });
    return list;
}

// какой предмет положить в турель: первый по приоритету, который включён, есть в ядре/руках и принимается
function pickItem(t, core, u) {
    const order = getPrio(t.block);
    for (let k = 0; k < order.length; k++) {
        if (!order[k].on) continue;
        var it = Vars.content.item(order[k].i);
        if (!it) continue;
        var have = (u.stack.item === it ? u.stack.amount : 0) + (core ? core.items.get(it) : 0);
        if (have > MIN_STOCK && t.acceptStack(it, 1, u) > 0) return it;
    }
    return null;
}

function step() {
    const p = Vars.player;
    const u = p.unit();
    if (!u || u.dead || u.type.itemCapacity <= 0) { status = "нет юнита"; return; }
    if (u.mineTile != null) { status = "идёт добыча"; return; }   // не мешаем добыче

    const core = u.closestCore();
    const coreNear = core != null && u.within(core, range());

    // турели, которым нужны патроны: самые пустые первыми
    const near = turretsNear(u);
    const hungry = near.filter(t => t.totalAmmo < t.block.maxAmmo - 1);
    const need = hungry.filter(t => pickItem(t, coreNear ? core : null, u) !== null);
    need.sort((a, b) => a.totalAmmo - b.totalAmmo);
    if (near.length == 0) status = "no turrets";
    else if (hungry.length == 0) status = "all full";
    else if (need.length == 0) status = coreNear ? "no ammo" : "core too far";
    else status = "filling: " + need.length;

    if (need.length == 0) {
        // все турели заряжены: вернуть ядру лишнее и забрать назад то, что было в руках
        if (!coreNear) return;
        if (u.hasItem() && lastReq !== null && u.stack.item === lastReq) {
            lastReq = null;
            Call.transferInventory(p, core);               // сдать лишние патроны, которые мы взяли
            return;
        }
        if (held != null) {
            if (!u.hasItem() && core.items.get(held.item) > 0) {
                Call.requestItem(p, core, held.item, Math.min(held.amount, u.type.itemCapacity));
            }
            held = null;
        }
        return;
    }

    const t = need[0];
    const item = pickItem(t, coreNear ? core : null, u);

    if (u.hasItem() && u.stack.item === item) {            // уже держим подходящий предмет — кладём в турель
        Call.transferInventory(p, t);
        return;
    }
    if (!coreNear) {
        if (u.hasItem() && t.acceptStack(u.stack.item, 1, u) > 0) Call.transferInventory(p, t);
        return;
    }
    if (u.hasItem()) {                                     // в руках что-то другое — запоминаем и сдаём в ядро
        if (held == null) held = { item: u.stack.item, amount: u.stack.amount };
        Call.transferInventory(p, core);
        return;
    }
    const amount = Math.min(t.acceptStack(item, u.type.itemCapacity, u), u.type.itemCapacity, core.items.get(item));
    if (amount > 0) { lastReq = item; Call.requestItem(p, core, item, amount); }
}

Events.run(TrigType.update, () => {
    if (!on || !Vars.state.isGame() || Vars.state.isPaused()) return;
    if (++tick % PERIOD != 0) return;
    try { step(); }
    catch (e) { status = "ошибка: " + e; if (!errLogged) { errLogged = true; Log.err("[TurretAutoFill] " + e); } }
});

function setOn(v) {
    on = v; status = "";
    held = null; lastReq = null;
    try { Vars.ui.showInfoToast(on ? T("toastOn") : T("toastOff"), 2); } catch (e) { }
}

// ---------- окно настроек ----------

let moving = false;        // режим перетаскивания кнопки
let root = null;           // таблица с кнопками
let rebuildBtns = () => { };

let settingsDialog = null;
const views = {};          // открытые копии настроек: dlg (окно по долгому нажатию) и emb (раздел в меню «Настройки»)

function rebuildAll() {
    Object.keys(views).forEach(function (k) { try { views[k](); } catch (e) { } });
    try { if (settingsDialog != null) settingsDialog.title.setText(T("title")); } catch (e) { }
    try { rebuildBtns(); } catch (e) { }
}

function makeContent(slot, hideParent) {
    const c = new Table();
    c.top();
    const expanded = {};

    function rebuild() {
        c.clear();

        // --- язык / language ---
        const lg = new Table();
        lg.background(Styles.black6);
        lg.margin(8);
        lg.add(T("language")).padRight(12);
        lg.button(cfg.lang == "ru" ? "Русский (RU)" : "English (EN)", Styles.defaultt, () => {
            cfg.lang = cfg.lang == "ru" ? "en" : "ru"; saveCfg(); rebuildAll();
        }).size(240, 50).pad(3);
        c.add(lg).growX().pad(4).row();

        // --- кнопка на экране ---
        const head = new Table();
        head.background(Styles.black6);
        head.margin(8);
        head.add(T("btnHead")).colspan(4).left().row();
        head.add(T("size") + cfg.scale + "%").padRight(12);
        head.button("-", Styles.defaultt, () => { cfg.scale = Math.max(50, cfg.scale - 10); saveCfg(); rebuildAll(); }).size(60, 48).pad(3);
        head.button("+", Styles.defaultt, () => { cfg.scale = Math.min(250, cfg.scale + 10); saveCfg(); rebuildAll(); }).size(60, 48).pad(3);
        head.row();
        head.button(T("move"), Styles.defaultt, () => {
            if (!Vars.state.isGame()) {      // в главном меню кнопки на экране нет
                try { Vars.ui.showInfoToast(T("notInGame"), 4); } catch (e) { }
                return;
            }
            moving = true; hideParent();
            try { Vars.ui.showInfoToast(T("dragHint"), 4); } catch (e) { }
        }).size(260, 50).pad(3).colspan(2);
        head.button(T("reset"), Styles.defaultt, () => { cfg.fx = 0.01; cfg.fy = 0.22; cfg.scale = 100; saveCfg(); rebuildAll(); }).size(150, 50).pad(3).colspan(2);
        c.add(head).growX().pad(4).row();

        c.add(T("prio")).pad(8).wrap().width(440).row();

        const turrets = [];
        Vars.content.blocks().each(b => { if (b instanceof ItemTurret) turrets.push(b); });
        turrets.forEach(b => {
            const open = !!expanded[b.name];
            const p = new Table();
            p.background(Styles.black6);
            p.margin(6);
            p.button(blockName(b), open ? Icon.up : Icon.down, Styles.flatt, 32, () => {
                expanded[b.name] = !expanded[b.name];
                rebuild();
            }).growX().height(48).row();
            if (open) {
                const list = getPrio(b).map(e => ({ i: e.i, on: e.on }));
                const body = new Table();
                list.forEach((e, idx) => {
                    const item = Vars.content.item(e.i);
                    const row = new Table();
                    try { row.image(new TextureRegionDrawable(item.uiIcon)).size(30).padRight(8); } catch (err) { }
                    row.add(itemName(item, e.i)).width(170).left();
                    row.button(T("on"), Styles.togglet, () => { e.on = !e.on; setPrio(b, list); }).checked(x => e.on).size(80, 42).pad(2);
                    row.button("", Icon.up, Styles.flatt, 32, () => {
                        if (idx > 0) { const tmp = list[idx - 1]; list[idx - 1] = list[idx]; list[idx] = tmp; setPrio(b, list); rebuildAll(); }
                    }).size(56, 42).pad(2);
                    row.button("", Icon.down, Styles.flatt, 32, () => {
                        if (idx < list.length - 1) { const tmp = list[idx + 1]; list[idx + 1] = list[idx]; list[idx] = tmp; setPrio(b, list); rebuildAll(); }
                    }).size(56, 42).pad(2);
                    body.add(row).left().row();
                });
                body.button(T("def"), Styles.defaultt, () => { delete cfg.prio[b.name]; prioCache[b.name] = null; saveCfg(); rebuildAll(); }).size(220, 44).pad(4).left();
                p.add(body).growX();
            }
            c.add(p).growX().pad(4).row();
        });
    }

    views[slot] = rebuild;
    rebuild();
    return c;
}

function buildSettings() {
    const d = new BaseDialog(T("title"));
    d.cont.pane(makeContent("dlg", () => d.hide())).grow();
    d.addCloseButton();
    d.shown(() => { try { views.dlg(); settingsDialog.title.setText(T("title")); } catch (e) { } });
    return d;
}

// ---------- кнопка на экране (двигается, меняет размер, не зависит от ориентации) ----------

function installHud() {
    if (Vars.headless) return;
    try {
        settingsDialog = buildSettings();
        root = new Table();
        root.touchable = Touchable.childrenOnly;
        let mainBtn = null;

        rebuildBtns = () => {
            const s = cfg.scale / 100;
            root.clear();
            mainBtn = root.button(T("btnOff"), Styles.togglet, () => { if (!moving) setOn(!on); }).size(190 * s, 64 * s).get();
            // долгое нажатие на кнопку открывает настройки
            try {
                mainBtn.addListener(new JavaAdapter(Packages.arc.scene.event.ElementGestureListener, {
                    longPress: function (actor, x, y) { if (!moving) settingsDialog.show(); return true; }
                }));
            } catch (e) { Log.err("[TurretAutoFill] долгое нажатие: " + e); }
            root.pack();
        };
        rebuildBtns();
        Vars.ui.hudGroup.addChild(root);

        let dragging = false, offX = 0, offY = 0, moved = 0;
        root.addCaptureListener(new JavaAdapter(Packages.arc.scene.event.InputListener, {
            touchDown: function (event, x, y, pointer, button) {
                if (!moving) return false;
                dragging = true; moved = 0;
                offX = event.stageX - root.x; offY = event.stageY - root.y;
                try { event.stop(); } catch (e) { }
                return true;
            },
            touchDragged: function (event, x, y, pointer) {
                if (!dragging) return;
                const W = Core.scene.getWidth(), H = Core.scene.getHeight();
                const w = Math.max(1, W - root.getWidth()), h = Math.max(1, H - root.getHeight());
                const nx = event.stageX - offX, ny = event.stageY - offY;
                moved += Math.abs(nx / w - cfg.fx) * w + Math.abs(ny / h - cfg.fy) * h;
                cfg.fx = Math.max(0, Math.min(1, nx / w));
                cfg.fy = Math.max(0, Math.min(1, ny / h));
            },
            touchUp: function (event, x, y, pointer, button) {
                if (!dragging) return;
                dragging = false;
                if (moved < 12) moving = false;          // просто коснулся — закончили перемещение
                saveCfg();
            }
        }));

        root.update(() => {
            try {
                root.visible = Vars.state.isGame() && !Vars.state.isEditor();
                const W = Core.scene.getWidth(), H = Core.scene.getHeight();
                let rw = root.getWidth(), rh = root.getHeight();
                // не даём кнопке занимать больше половины ширины (на узком экране при повороте)
                if (rw > W * 0.6 && cfg.scale > 50) { cfg.scale = Math.max(50, cfg.scale - 10); rebuildBtns(); rw = root.getWidth(); rh = root.getHeight(); }
                root.setPosition(cfg.fx * Math.max(0, W - rw), cfg.fy * Math.max(0, H - rh));
                const s = cfg.scale / 100;
                if (mainBtn != null) {
                    mainBtn.setChecked(on);
                    mainBtn.getLabel().setFontScale(Math.min(1.6, s));
                    mainBtn.getLabel().setText(moving ? T("drag") : (on ? T("btnOn") : T("btnOff")));
                }
            } catch (e) { root.visible = false; }
        });
        Log.info("[TurretAutoFill] кнопка добавлена");
    } catch (e) { Log.err("[TurretAutoFill] не удалось добавить кнопку: " + e); }

    // раздел в меню «Настройки» игры: настройки сразу внутри, без промежуточной кнопки
    try {
        Vars.ui.settings.addCategory("Turret Auto Fill (mobile)", Icon.turret || Icon.settings, new Packages.arc.func.Cons({
            get: t => {
                t.row();
                t.add(makeContent("emb", () => Vars.ui.settings.hide())).growX().row();
            }
        }));
        Log.info("[TurretAutoFill] settings category added");
    } catch (e) { Log.err("[TurretAutoFill] не удалось добавить пункт в настройки: " + e); }
}

Events.on(ClientLoadEvent, e => installHud());
Events.on(WorldLoadEvent, e => { held = null; lastReq = null; });
