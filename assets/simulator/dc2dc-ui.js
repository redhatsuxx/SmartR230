/* ===================================================================
   SmartR230 section: sleep timers and dash clock set. The clock set runs
   in real time like the real device: a short session, then the dash
   clock changes.
   =================================================================== */
const Device = (function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const ck = { st: 'IDLE', t: 0, res: 'NONE', req: { dd: 1, hh: 0, mm: 0 } };
  const DUR = { CONNECTING: 1.2, SENDING: 2.0, HOLDING: 5.0, DONE: 2.0 };
  const NEXT = { CONNECTING: 'SENDING', SENDING: 'HOLDING', HOLDING: 'DONE', DONE: 'IDLE' };
  const RES = { NONE: '\u2014', OK: 'OK', BLOCKED: 'Blocked: emulation lost mid-session' };
  function tick(dt) {
    if (ck.st === 'IDLE') return;
    if (!Core.clockAllowed()) { ck.st = 'IDLE'; ck.res = 'BLOCKED'; Core.note('MODEL', 'Clock Set stopped: the emulator lost the bus mid-session.'); return; }
    ck.t += dt;
    if (ck.t >= DUR[ck.st]) {
      ck.t = 0; ck.st = NEXT[ck.st];
      if (ck.st === 'HOLDING') Core.act.setClock(ck.req.dd, ck.req.hh, ck.req.mm);
      if (ck.st === 'DONE') ck.res = 'OK';
    }
  }
  function phone() {
    const d = new Date();
    $('csDd').value = d.getDate(); $('csHh').value = d.getHours(); $('csMm').value = d.getMinutes();
  }
  function submit() {
    if (!Core.wifiOn()) return false;
    ck.req = { dd: parseInt($('csDd').value, 10) || 1, hh: parseInt($('csHh').value, 10) || 0, mm: parseInt($('csMm').value, 10) || 0 };
    if (Core.clockAllowed() && ck.st === 'IDLE') { ck.st = 'CONNECTING'; ck.t = 0; ck.res = 'NONE'; if (api.onStart) api.onStart(); }
    return true;
  }
  function refresh() {
    const on = Core.cfg.emu === 'on', d = Core.device();
    $('srSleep').textContent = on ? d.sl : '\u2013';
    $('srWifi').textContent = on ? (Core.wifiOn() ? d.wo : 'off') : '\u2013';
    $('srWarn').hidden = !(on && d.sa);
    $('srSess').textContent = ck.st;
    $('srRes').textContent = RES[ck.res];
    const ok = Core.wifiOn();
    $('bSetClock').disabled = !ok || ck.st !== 'IDLE';
    ['csDd', 'csHh', 'csMm', 'bPhone'].forEach(i => { $(i).disabled = !ok; });
  }
  $('bPhone').onclick = phone;
  $('bSetClock').onclick = submit;
  const api = {
    tick, phone, submit, refresh, onStart: null,
    render() {}, go() {}, setVin() {},
    resetSession() { ck.st = 'IDLE'; ck.t = 0; ck.res = 'NONE'; }
  };
  return api;
})();

/* ===================== UI wiring ===================== */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const { cfg, F, L, act } = Core;
  const NS = 'http://www.w3.org/2000/svg';
  const pad = n => String(n).padStart(2, '0');
  const mmss = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + pad(s % 60); };
  function fmtClock(t) {
    t = Math.floor(t);
    return Math.floor(t / 86400) + 'd ' + pad(Math.floor(t % 86400 / 3600)) + ':' + pad(Math.floor(t % 3600 / 60)) + ':' + pad(t % 60);
  }
  function fmtT(t) {
    t = Math.floor(t);
    const d = Math.floor(t / 86400), h = Math.floor(t % 86400 / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
    return (d ? d + 'd ' : '') + (d || h ? pad(h) + ':' : '') + pad(m) + ':' + pad(s);
  }
  const num = (el, v, unit, dp) => { el.innerHTML = v.toFixed(dp === undefined ? 1 : dp) + '<i>' + unit + '</i>'; };

  let speed = 10, running = true, last = performance.now();
  let lastLogN = -1, lastDtc = '', hr12 = false;

  function wire(id, mode, slow, rev) {
    $(id).setAttribute('class', 'w' + (mode ? ' ' + mode : '') + (slow ? ' slow' : '') + (mode && rev ? ' rev' : ''));
  }
  const modeOf = i => (i > 0.05 ? 'chg' : i < -0.05 ? 'live' : '');

  /* ---- instrument gauges ---- */
  function makeGauge(id, o) {
    const svg = $(id), N = 'http://www.w3.org/2000/svg';
    const el = (t, a, txt) => { const e = document.createElementNS(N, t); Object.keys(a || {}).forEach(k => e.setAttribute(k, a[k])); if (txt !== undefined) e.textContent = txt; svg.appendChild(e); return e; };
    const ang = v => 135 + 270 * (v - o.min) / (o.max - o.min);
    const pt = (v, r) => { const a = ang(v) * Math.PI / 180; return [100 + r * Math.cos(a), 100 + r * Math.sin(a)]; };
    el('circle', { class: 'bez', cx: 100, cy: 100, r: 94 });
    const minorN = o.minor || 5;
    const steps = Math.round((o.max - o.min) / o.major) * minorN;
    for (let i = 0; i <= steps; i++) {
      const v = o.min + i * o.major / minorN;
      const mj = i % minorN === 0;
      const red = o.red !== undefined && v >= o.red - 1e-9;
      const p1 = pt(v, 86), p2 = pt(v, mj ? 72 : 79);
      el('line', { class: 'tk' + (mj ? ' mj' : '') + (red ? ' rd' : ''), x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] });
      if (mj) { const t = pt(v, 56); el('text', { x: t[0], y: t[1] + 4.5 }, o.fmt ? o.fmt(v) : String(Math.round(v * 100) / 100)); }
    }
    el('text', { class: 'u', x: 100, y: 142 }, o.unit);
    const ro = el('text', { class: 'ro', x: 100, y: 168 }, '');
    const nd = el('line', { class: 'nd', x1: 100, y1: 100, x2: 172, y2: 100 });
    el('circle', { class: 'hub', cx: 100, cy: 100, r: 8 });
    return { set(v, txt) {
      const c = Math.min(o.max, Math.max(o.min, v));
      nd.style.transform = 'rotate(' + ang(c) + 'deg)';
      ro.textContent = txt === undefined ? '' : txt;
    } };
  }
  const G = {
    spd: makeGauge('gSpd', { min: 0, max: 160, major: 20, minor: 2, unit: 'MPH' }),
    rpm: makeGauge('gRpm', { min: 0, max: 7, major: 1, red: 6, unit: 'RPM' })
  };

  /* ---- CAN-B bus drawing ---- */
  const canEls = {};
  (function buildCan() {
    const g = $('canMods');
    const top = ['eis', 'sam', 'rsam', 'pse', 'roof', 'clu'], bot = ['clim', 'door', 'park', 'seat', 'emu'];
    const byId = {}; Core.MODS.forEach(m => { byId[m.id] = m; });
    byId.emu = { id: 'emu', name: 'SmartR230' };
    function mk(id, cx, y, up) {
      const grp = document.createElementNS(NS, 'g'); grp.setAttribute('class', 'mod');
      const stub = document.createElementNS(NS, 'path'); stub.setAttribute('class', 'w');
      stub.setAttribute('d', up ? 'M' + cx + ' ' + (y + 44) + 'V125' : 'M' + cx + ' 125V' + y);
      const r = document.createElementNS(NS, 'rect'); r.setAttribute('class', 'box'); r.setAttribute('x', cx - 52); r.setAttribute('y', y); r.setAttribute('width', 104); r.setAttribute('height', 44);
      const n = document.createElementNS(NS, 'text'); n.setAttribute('x', cx); n.setAttribute('y', y + 19); n.setAttribute('text-anchor', 'middle'); n.setAttribute('class', 'lab'); n.textContent = byId[id].name.toUpperCase();
      const s = document.createElementNS(NS, 'text'); s.setAttribute('x', cx); s.setAttribute('y', y + 35); s.setAttribute('text-anchor', 'middle'); s.setAttribute('class', 'st'); s.setAttribute('style', 'font-size:10px');
      grp.append(stub, r, n, s); g.appendChild(grp);
      canEls[id] = { grp, stub, n, s };
    }
    top.forEach((id, i) => mk(id, 70 + 124 * i, 40, true));
    bot.forEach((id, i) => mk(id, 132 + 124 * i, 166, false));
  })();

  function renderCan(S) {
    const mods = Core.mods();
    mods.forEach(m => {
      const e = canEls[m.id];
      e.grp.setAttribute('class', 'mod' + (m.awake ? ' awake' : '') + (m.suspect ? ' suspect' : ''));
      e.s.textContent = m.suspect ? 'SUSPECT · AWAKE' : m.awake ? 'AWAKE' : 'ASLEEP';
      e.stub.setAttribute('class', 'w' + (m.awake ? ' live slow' : ''));
      if (m.awake) e.stub.style.stroke = 'var(--green)'; else e.stub.style.stroke = '';
    });
    const E = canEls.emu, em = cfg.emu;
    let cl = 'mod', st = '';
    if (em === 'none') { cl += ' miss'; E.n.textContent = 'N82/1'; st = 'MISSING'; }
    else {
      E.n.textContent = 'SMARTR230';
      if (em === 'off') st = 'UNPLUGGED';
      else if (S.emu.st === 'AWAKE') { cl += ' awake'; st = 'AWAKE'; }
      else if (S.emu.st === 'QUIET') st = 'LISTENING';
      else st = 'DEEP SLEEP';
    }
    E.grp.setAttribute('class', cl); E.s.textContent = st;
    E.stub.setAttribute('class', 'w' + (em === 'on' && S.emu.st === 'AWAKE' ? ' live slow' : ''));
    E.stub.style.stroke = em === 'on' && S.emu.st === 'AWAKE' ? 'var(--green)' : '';
    $('canLine').setAttribute('class', 'w' + (S.awake ? ' live slow' : ''));
    $('canLine').style.stroke = S.awake ? 'var(--green)' : '';
    $('vBus').textContent = S.awake ? 'awake' : 'asleep';
  }

  function oriTimer(S) {
    const O = S.orion, o = cfg.o;
    switch (O.st) {
      case 'START DELAY': return 'starts in ' + mmss(O.tmr);
      case 'CHARGING': return O.stopT > 0 ? 'stopping in ' + mmss(o.tStop - O.stopT) : Core.stage();
      case 'REVERSE': return 'reverse ' + mmss(O.tmr) + ' left';
      case 'SETTLE': return 'settling ' + mmss(O.tmr);
      case 'LOCKOUT': return 'needs above ' + o.vLockIn.toFixed(1) + ' V';
      case 'WAITING': return 'needs above ' + o.vStart.toFixed(1) + ' V';
      case 'OFF': return 'LINK open';
      default: return '';
    }
  }
  function hintText(S) {
    if (S.eng) return S.orion.st === 'CHARGING' ? 'Engine running. The DC2DC charger is charging G1/4.' : 'Engine running. The DC2DC charger waits for the bus to hold ' + cfg.o.vStart.toFixed(1) + ' V for ' + cfg.o.tStart + ' s.';
    if (S.key && !S.pwr) return 'Key in, but the EIS has no power (bus under ' + cfg.modMinV.toFixed(1) + ' V). Close the isolator to power the modules from G1/4, then start.';
    if (S.eng && S.iso && S.R.altOK) return 'Engine running on the alternator. You can open the isolator now.';
    if (S.key) return cfg.emu === 'on' ? 'Key in. Start the engine.' : 'Key in. Nothing answers for N82/1, so the dash complains.';
    if (S.awake) return 'The bus is awake but will go quiet shortly.';
    return 'Inserting the key wakes the CAN-B bus.';
  }
  const LEDTXT = { none: ['NOT FITTED', 'No emulator, so no LED'], off: ['OFF', 'Deep sleep or unplugged'], flash: ['FLASHING', 'CAN bus awake'], steady: ['STEADY', 'Bus quiet; five-minute timer running'] };

  function render() {
    const S = Core.S, R = S.R, ld = R.ld, O = S.orion;
    $('vCar').textContent = S.awake ? 'AWAKE' : 'ASLEEP';
    $('chipCar').classList.toggle('on', S.awake);
    $('vOri').textContent = O.st;
    $('chipOri').classList.toggle('on', O.st === 'CHARGING' || O.st === 'REVERSE');
    const led = Core.led();
    $('vLed').textContent = LEDTXT[led][0];
    $('chipLed').classList.toggle('on', led === 'flash' || led === 'steady');
    $('vClock').textContent = fmtClock(S.t);
    $('vKey').textContent = S.eng ? 'engine running' : S.key ? 'key in' : 'key out';

    $('bKeyIn').disabled = S.key; $('bKeyOut').disabled = !S.key;
    $('bStart').disabled = !S.key || S.eng; $('bStop').disabled = !S.eng;
    $('bWake').disabled = S.awake; $('bRev').disabled = S.eng;
    $('vNote').textContent = hintText(S);
    $('mIso').checked = S.iso; $('mLink').checked = cfg.remote;
    $('fBad').checked = F.bad; $('fAlt').checked = F.alt; $('fRev').checked = F.revpol;
    $('fF2').checked = F.fuse.f2; $('fIn').checked = F.fuse.in; $('fOut').checked = F.fuse.out; $('fLink').checked = F.fuse.link;
    if (document.activeElement !== $('selWake')) $('selWake').value = F.wake;
    document.querySelectorAll('.fault').forEach(l => l.classList.toggle('active', l.querySelector('input').checked && l.querySelector('input').id !== 'mLink'));
    $('mLink').closest('.fault').classList.toggle('active', !cfg.remote);

    [['rSoc1', 'oSoc1', 'sSoc1', S.soc1, Core.ocv1], ['rSoc4', 'oSoc4', 'sSoc4', S.soc4, Core.ocv4]].forEach(a => {
      const p = Math.round(a[3] * 100);
      if (document.activeElement !== $(a[0])) $(a[0]).value = p;
      $(a[1]).textContent = p + '%';
      $(a[2]).textContent = 'rest voltage ' + a[4](a[3]).toFixed(1) + ' V';
    });

    /* schematic */
    const alt = R.altOK;
    wire('wAlt1', alt ? 'chg' : '', false, false); wire('wAlt2', alt ? 'chg' : '', false, false);
    wire('wLoad', ld.I > 0.05 ? 'live' : '', ld.I < 2);
    wire('wG1', modeOf(R.I1), Math.abs(R.I1) < 1, R.I1 < 0);
    const inMode = R.Iin > 0.05 ? (alt ? 'chg' : 'live') : R.Iin < -0.05 ? 'chg' : '';
    const inSlow = Math.abs(R.Iin) < 1;
    wire('wIn1', inMode, inSlow, R.Iin < 0); wire('wIn2', inMode, inSlow, R.Iin < 0);
    wire('wOut1', modeOf(R.Iout), Math.abs(R.Iout) < 1, R.Iout < 0); wire('wOut2', modeOf(R.Iout), Math.abs(R.Iout) < 1, R.Iout < 0);
    wire('wB4', modeOf(R.I4), Math.abs(R.I4) < 1, R.I4 < 0);
    const lk = R.linkOn ? modeOf(R.Il) : '';
    ['wLk1', 'wLk2', 'wLk3'].forEach(id => wire(id, lk, Math.abs(R.Il) < 1, R.Il < 0));
    wire('wCan', S.awake ? 'live' : '', true);
    $('wCan').style.stroke = S.awake ? 'var(--green)' : '';
    const bl = $('isoBlade');
    if (S.iso) { bl.setAttribute('x2', '430'); bl.setAttribute('y2', '275'); bl.setAttribute('class', 'blade on'); }
    else { bl.setAttribute('x2', '425'); bl.setAttribute('y2', '253'); bl.setAttribute('class', 'blade'); }
    $('svOri').textContent = O.st;
    $('svOriT').textContent = oriTimer(S) || ' ';
    $('oriBox').style.stroke = O.st === 'DEAD' ? 'var(--red)' : O.st === 'CHARGING' || O.st === 'REVERSE' ? 'var(--green)' : '';
    $('svLink').textContent = cfg.remote ? 'LINK jumper fitted' : 'LINK jumper REMOVED';
    $('linkBox').style.stroke = cfg.remote ? '' : 'var(--red)';
    $('svLed').setAttribute('class', 'led' + (led === 'flash' || led === 'steady' ? ' ' + led : ''));
    $('svLedT').textContent = 'LED ' + LEDTXT[led][0].toLowerCase();
    $('svSr').textContent = cfg.emu === 'on' ? 'emulates N82/1' : cfg.emu === 'off' ? 'unplugged' : 'not fitted';
    $('srBox').style.strokeDasharray = cfg.emu === 'on' ? '' : '4 4';
    $('sv4v').textContent = R.Vs.toFixed(1) + ' V';
    $('sv4s').textContent = Math.round(S.soc4 * 100) + '%';
    $('sv1v').textContent = R.Vb.toFixed(1) + ' V';
    $('sv1s').textContent = Math.round(S.soc1 * 100) + '%';
    $('sv4c').textContent = 'lead-acid ' + cfg.cap4 + ' Ah';
    $('sv1c').textContent = 'AGM ' + cfg.cap1 + ' Ah' + (F.bad ? ' weak' : '');
    $('b1').style.stroke = R.Vb < 10.5 ? 'var(--red)' : '';
    $('g2c').style.stroke = F.alt ? 'var(--red)' : '';
    $('svG2').textContent = F.alt ? 'FAILED' : alt ? Core.consts.ALT_V.toFixed(1) + ' V' : S.eng ? 'cut off' : 'idle';
    $('svLoad').textContent = ld.I.toFixed(1) + ' A';
    [['fuseF2', 'svF2', 'f2'], ['fuseIn', 'svFin', 'in'], ['fuseOut', 'svFout', 'out'], ['fuseLink', 'svFlk', 'link']].forEach(a => {
      $(a[0]).setAttribute('class', 'fuse' + (F.fuse[a[2]] ? ' blown' : ''));
      $(a[1]).textContent = F.fuse[a[2]] ? 'BLOWN' : (a[2] === 'link' && S.heat.link > 5 ? 'hot ' + Math.round(S.heat.link / 1.2) + '%' : 'intact');
    });

    /* cluster and clock */
    const d = Core.dash();
    $('mfd').className = 'mfd c' + d.cat + (d.off ? ' off' : '');
    $('mfdMsg').innerHTML = d.off ? '&nbsp;' : d.msg;
    $('mfdSub').textContent = d.off ? ' ' : (d.sub || ' ');
    $('mfdIcon').style.color = d.cat === 1 ? '#ff6b6f' : '#5a6069';
    $('mfdIcon').style.display = d.cat === 0 ? 'none' : '';
    $('vCl').textContent = d.off ? 'display off' : d.cat === 1 ? 'category 1 (red)' : 'display on';
    const live = !d.off;
    G.spd.set(0, live ? '0' : '');
    G.rpm.set(S.eng && live ? 0.75 : 0, live && S.eng ? '750' : '');
    const c = Core.clockNow();
    $('clkT').textContent = hr12 ? (((c.hh + 11) % 12) + 1) + ':' + pad(c.mm) + ' ' + (c.hh < 12 ? 'AM' : 'PM') : pad(c.hh) + ':' + pad(c.mm);
    $('clkD').textContent = 'day ' + c.dd;
    $('clk').classList.toggle('off', !!d.off);

    renderCan(S);

    /* SmartR230 section */
    $('ledBig').className = 'ledbig' + (led === 'flash' || led === 'steady' ? ' ' + led : '');
    $('ledTxt').textContent = 'LED ' + LEDTXT[led][0];
    $('ledSub').textContent = LEDTXT[led][1];
    $('vEmuState').textContent = cfg.emu === 'none' ? 'not fitted' : cfg.emu === 'off' ? 'unplugged' : S.emu.st === 'AWAKE' ? 'bus awake' : S.emu.st === 'QUIET' ? 'bus quiet, timer running' : 'deep sleep';
    $('segEmu').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.e === cfg.emu ? 'true' : 'false'));
    $('bJump').disabled = cfg.emu !== 'on'; $('bReboot').disabled = cfg.emu !== 'on';

    /* DC2DC panel */
    const stBad = O.st === 'DEAD' || O.st === 'LOCKOUT' || O.st === 'NO POWER' || O.st === 'NO INPUT' || O.st === 'NO OUTPUT' || O.st === 'OFF';
    $('vcBox').className = 'vc' + (stBad ? ' bad' : '');
    $('vcSt').textContent = O.st;
    $('vcStage').textContent = Core.stage();
    $('vcVin').textContent = R.Vin.toFixed(2) + ' V';
    $('vcVout').textContent = R.Vs.toFixed(2) + ' V';
    $('vcIin').textContent = R.Iin.toFixed(1) + ' A';
    $('vcIout').textContent = R.Iout.toFixed(1) + ' A';
    $('vcTim').textContent = oriTimer(S) || '–';

    /* readings */
    num($('rVb'), R.Vb, 'V'); num($('rV4'), R.Vs, 'V');
    $('stVb').className = 'stat' + (R.Vb < 11 ? ' bad' : R.Vb < 12 ? ' warn' : '');
    $('stV4').className = 'stat' + (R.Vs < 11.9 ? ' bad' : '');
    num($('rLoad'), ld.I, 'A', ld.I < 1 ? 2 : 1); num($('rAlt'), alt ? R.Ialt : 0, 'A');
    num($('rI1'), R.I1, 'A', Math.abs(R.I1) < 1 ? 2 : 1); num($('rI4'), R.I4, 'A', Math.abs(R.I4) < 1 ? 2 : 1);
    num($('rIo'), R.Iout, 'A'); num($('rIl'), R.Il, 'A');
    [['rS1', 'bar1', S.soc1], ['rS4', 'bar4', S.soc4]].forEach(a => {
      $(a[0]).textContent = (a[2] * 100).toFixed(1) + '%';
      const bar = $(a[1]);
      bar.firstElementChild.style.width = (a[2] * 100) + '%';
      bar.className = 'bar' + (a[2] < 0.15 ? ' crit' : a[2] < 0.3 ? ' low' : '');
    });
    $('rCrank').textContent = S.lastCrank === null ? '–' : S.lastCrank.toFixed(1) + ' V | ' + (S.lastCrank30 === undefined ? '–' : S.lastCrank30.toFixed(1) + ' V');
    $('rHeat').textContent = F.fuse.link ? 'blown' : Math.round(S.heat.link / 1.2) + '%';

    /* status */
    $('vSt').textContent = d.cat === 1 ? 'dash warning' : 'normal';
    $('oOri').textContent = O.st.toLowerCase();
    $('oStage').textContent = Core.stage().toLowerCase();
    $('oIso').textContent = S.iso ? (F.fuse.link ? 'closed, fuse blown' : 'closed') : 'open';
    $('oLink').textContent = cfg.remote ? 'fitted' : 'removed';
    $('oEmu').textContent = cfg.emu === 'on' ? S.emu.st.toLowerCase() : cfg.emu === 'off' ? 'unplugged' : 'not fitted';
    $('oWifi').textContent = Core.wifiOn() ? 'on' : 'off';
    $('oDash').textContent = d.off ? 'off' : d.cat === 1 ? 'battery fault' : 'clean';
    $('oDash').parentElement.classList.toggle('cut', d.cat === 1);
    $('oLink').parentElement.classList.toggle('cut', !cfg.remote);
    $('oIso').parentElement.classList.toggle('cut', S.iso && F.fuse.link);

    const dj = JSON.stringify(S.dtc);
    if (dj !== lastDtc) {
      lastDtc = dj;
      const ul = $('dtcList'); ul.textContent = '';
      if (!S.dtc.length) { const li = document.createElement('li'); li.className = 'none'; li.textContent = 'No entries'; ul.appendChild(li); }
      S.dtc.forEach(x => { const li = document.createElement('li'); li.textContent = x.label; ul.appendChild(li); });
      $('bClear').disabled = !S.dtc.length;
    }
    if (S.logN !== lastLogN) {
      lastLogN = S.logN;
      const ul = $('log'); ul.textContent = '';
      S.log.forEach(e => {
        const li = document.createElement('li');
        const tm = document.createElement('time'); tm.textContent = fmtT(e.t);
        const g = document.createElement('span'); g.className = 'tag t-' + (e.src === 'SPEC' ? 'vic' : e.src === 'USER' ? 'user' : e.src === 'DEMO' ? 'demo' : 'model'); g.textContent = e.src;
        const m = document.createElement('span'); m.textContent = e.msg;
        li.append(tm, g, m); ul.appendChild(li);
      });
    }
    Device.refresh();
  }

  /* ---- demos ---- */
  const fmtSpeed = n => (n >= 3600 ? (n / 3600) + ' h/s' : n + '×');
  function setSpeed(n) {
    speed = n;
    $('segSpeed').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', +x.dataset.s === n ? 'true' : 'false'));
    $('oSpeed').textContent = fmtSpeed(n);
  }
  Device.onStart = () => { if (speed > 10) setSpeed(1); };
  function syncSettings() {
    $('rVstart').value = cfg.o.vStart; $('oVstart').textContent = cfg.o.vStart.toFixed(1) + ' V';
    $('rTstart').value = cfg.o.tStart; $('oTstart').textContent = cfg.o.tStart + ' s';
    $('rVstop').value = cfg.o.vStop; $('oVstop').textContent = cfg.o.vStop.toFixed(1) + ' V';
    $('rLimOut').value = cfg.o.limOut; $('oLimOut').textContent = cfg.o.limOut + ' A';
    const mo = cfg.rw * 1000; $('rRw').value = mo; $('oRw').innerHTML = mo.toFixed(1) + ' m&Omega;';
    const mA = Math.round(cfg.sleepA * 1000); $('rSleep').value = mA; $('oSleep').textContent = mA + ' mA';
    const ea = Math.round(cfg.emuAwakeA * 1000); $('rEmuA').value = ea; $('oEmuA').textContent = ea + ' mA';
    const eq = Math.round(cfg.emuQuietA * 1000); $('rEmuQ').value = eq; $('oEmuQ').textContent = eq + ' mA';
    const es = Math.round(cfg.emuSleepA * 1000); $('rEmuS').value = es; $('oEmuS').textContent = es + ' mA';
    $('rModV').value = cfg.modMinV; $('oModV').textContent = cfg.modMinV.toFixed(1) + ' V';
    $('rBlow').value = L.blowPct; $('oBlow').textContent = L.blowPct + '%';
    $('selSus').value = cfg.suspect;
  }
  function syncInputs() {
    $('lHead').checked = L.head; $('lBlow').checked = L.blow; $('lDef').checked = L.def;
    $('lSeat').checked = L.seat; $('lAud').checked = L.aud;
    $('rExtra').value = L.extra; $('oExtra').textContent = L.extra + ' A';
  }
  let curDemo = null;
  function demoUi(on, title) {
    $('demoBar').hidden = !on;
    if (title) $('demoTitle').textContent = title;
    document.querySelectorAll('#demoList button').forEach(b => b.setAttribute('aria-current', on && b.dataset.id === curDemo ? 'true' : 'false'));
  }
  function stopDemo() { Demos.stop(); curDemo = null; demoUi(false); }
  function startDemo(id) {
    Device.resetSession();
    const d = Demos.start(id); if (!d) return;
    curDemo = id; running = true; $('bRun').textContent = 'Pause';
    lastLogN = -1; lastDtc = '';
    syncSettings(); syncInputs(); Device.render();
    demoUi(true, d.title);
    $('demoSay').textContent = d.blurb;
    $('demoProg').style.width = '0%';
    Core.step(0);
  }
  const dl = $('demoList');
  Demos.list.forEach(d => {
    const b = document.createElement('button');
    b.className = 'demo'; b.dataset.id = d.id; b.setAttribute('aria-current', 'false');
    const t = document.createElement('b'); t.textContent = d.title;
    const s = document.createElement('span'); s.textContent = d.blurb;
    b.append(t, s); b.onclick = () => startDemo(d.id); dl.appendChild(b);
  });

  function uiToken(tk) {
    if (tk === 'clock:open') Device.go('clock');
    else if (tk === 'clock:phone') Device.phone();
    else if (tk === 'clock:submit') Device.submit();
  }

  /* ---- loop ---- */
  function frame(now) {
    const real = Math.min(0.1, (now - last) / 1000); last = now;
    Device.tick(real);
    if (running) {
      const r = Demos.tick(real);
      if (r) {
        if (r.speed) setSpeed(r.speed);
        if (r.say) $('demoSay').textContent = r.say;
        if (r.fired) { syncInputs(); syncSettings(); }
        (r.ui || []).forEach(uiToken);
        $('demoProg').style.width = (r.progress * 100) + '%';
        if (r.done) { curDemo = null; $('demoTitle').textContent = 'Demo finished'; document.querySelectorAll('#demoList button').forEach(b => b.setAttribute('aria-current', 'false')); }
      }
      let sim = real * speed;
      while (sim > 0) { const dt = Math.min(1, sim); Core.step(dt); sim -= dt; }
    }
    render();
    requestAnimationFrame(frame);
  }
  const poke = () => { Core.step(0); render(); };

  /* ---- bindings ---- */
  $('bKeyIn').onclick = () => { act.keyIn(); poke(); };
  $('bKeyOut').onclick = () => { act.keyOut(); poke(); };
  $('bStart').onclick = () => { act.start(); poke(); };
  $('bStop').onclick = () => { act.stop(); poke(); };
  $('bWake').onclick = () => { act.canWake(); poke(); };
  $('bRev').onclick = () => { act.reverse(); poke(); };
  $('bDemoStop').onclick = () => { stopDemo(); setSpeed(10); };
  $('bClear').onclick = () => { act.clearDtc(); poke(); };
  $('mIso').onchange = () => { act.iso($('mIso').checked); poke(); };
  $('mLink').onchange = () => { act.link($('mLink').checked); poke(); };
  $('bRun').onclick = () => { running = !running; $('bRun').textContent = running ? 'Pause' : 'Resume'; };
  $('segSpeed').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setSpeed(+b.dataset.s); });
  $('segEmu').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; Device.resetSession(); act.setEmu(b.dataset.e); Device.render(); poke(); });
  $('bJump').onclick = () => { act.jumpToSleep(); poke(); };
  $('bReboot').onclick = () => { if (cfg.emu !== 'on') return; Device.resetSession(); act.setEmu('off'); act.setEmu('on'); Device.render(); poke(); };
  $('clk').querySelector('.tog').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    hr12 = b.dataset.h === '12';
    $('clk').querySelectorAll('.tog button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
  });

  $('bReset').onclick = () => { stopDemo(); Device.resetSession(); Core.reset('healthy', { warm: true }); syncSettings(); syncInputs(); Device.render(); lastLogN = -1; lastDtc = ''; poke(); };
  $('scen').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    stopDemo(); Device.resetSession(); Core.reset(b.dataset.sc); syncSettings(); syncInputs(); Device.render(); lastLogN = -1; lastDtc = '';
    Core.S.log.shift();
    const names = { healthy: 'healthy car', weak: 'weak systems battery', flat: 'flat systems battery', deadalt: 'dead alternator', noemu: 'no SmartR230 fitted', wontsleep: 'car that will not sleep' };
    Core.S.log.unshift({ t: 0, src: 'USER', msg: 'Scenario loaded: ' + names[b.dataset.sc] + '. Insert the key to begin.' });
    Core.S.logN++;
    poke();
  });

  const fmap = { fBad: 'bad', fAlt: 'alt', fRev: 'revpol' };
  Object.keys(fmap).forEach(id => { $(id).onchange = () => { act.fault(fmap[id], $(id).checked); poke(); }; });
  const fumap = { fF2: 'f2', fIn: 'in', fOut: 'out', fLink: 'link' };
  Object.keys(fumap).forEach(id => { $(id).onchange = () => { if (F.fuse[fumap[id]] !== $(id).checked) act.blowFuse(fumap[id]); poke(); }; });
  Core.SUSPECTS.forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n; $('selSus').appendChild(o); });
  $('selSus').onchange = () => { cfg.suspect = $('selSus').value; Core.S.tally = {}; poke(); };
  $('selWake').onchange = () => { act.setWake($('selWake').value); poke(); };
  const lmap = { lHead: 'head', lBlow: 'blow', lDef: 'def', lSeat: 'seat', lAud: 'aud' };
  Object.keys(lmap).forEach(id => { $(id).onchange = () => { L[lmap[id]] = $(id).checked; poke(); }; });
  $('rExtra').oninput = () => { L.extra = +$('rExtra').value; $('oExtra').textContent = L.extra + ' A'; poke(); };
  $('rBlow').oninput = () => { L.blowPct = +$('rBlow').value; $('oBlow').textContent = L.blowPct + '%'; poke(); };

  $('rVstart').oninput = () => { cfg.o.vStart = +$('rVstart').value; $('oVstart').textContent = cfg.o.vStart.toFixed(1) + ' V'; poke(); };
  $('rTstart').oninput = () => { cfg.o.tStart = +$('rTstart').value; $('oTstart').textContent = cfg.o.tStart + ' s'; poke(); };
  $('rVstop').oninput = () => { cfg.o.vStop = +$('rVstop').value; $('oVstop').textContent = cfg.o.vStop.toFixed(1) + ' V'; poke(); };
  $('rLimOut').oninput = () => { cfg.o.limOut = +$('rLimOut').value; $('oLimOut').textContent = cfg.o.limOut + ' A'; poke(); };
  $('rRw').oninput = () => { cfg.rw = +$('rRw').value / 1000; $('oRw').innerHTML = (+$('rRw').value).toFixed(1) + ' m&Omega;'; poke(); };
  $('rModV').oninput = () => { cfg.modMinV = +$('rModV').value; $('oModV').textContent = cfg.modMinV.toFixed(1) + ' V'; poke(); };
  $('rSleep').oninput = () => { const mA = +$('rSleep').value; cfg.sleepA = mA / 1000; $('oSleep').textContent = mA + ' mA'; poke(); };
  $('rEmuA').oninput = () => { const mA = +$('rEmuA').value; cfg.emuAwakeA = mA / 1000; $('oEmuA').textContent = mA + ' mA'; poke(); };
  $('rEmuQ').oninput = () => { const mA = +$('rEmuQ').value; cfg.emuQuietA = mA / 1000; $('oEmuQ').textContent = mA + ' mA'; poke(); };
  $('rEmuS').oninput = () => { const mA = +$('rEmuS').value; cfg.emuSleepA = mA / 1000; $('oEmuS').textContent = mA + ' mA'; poke(); };
  $('rSoc1').oninput = () => { Core.setSoc(1, +$('rSoc1').value / 100); poke(); };
  $('rSoc4').oninput = () => { Core.setSoc(4, +$('rSoc4').value / 100); poke(); };
  $('nCap1').onchange = () => { cfg.cap1 = Math.min(150, Math.max(20, +$('nCap1').value || 70)); $('nCap1').value = cfg.cap1; poke(); };
  $('nCap4').onchange = () => { cfg.cap4 = Math.min(150, Math.max(20, +$('nCap4').value || 35)); $('nCap4').value = cfg.cap4; poke(); };

  const hit = (id, fn) => {
    const el = $(id);
    el.addEventListener('click', () => { fn(); poke(); });
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); poke(); } });
  };
  hit('fuseF2', () => act.blowFuse('f2')); hit('fuseIn', () => act.blowFuse('in'));
  hit('fuseOut', () => act.blowFuse('out')); hit('fuseLink', () => act.blowFuse('link'));
  hit('isoTog', () => act.iso(!Core.S.iso)); hit('linkTog', () => act.link(!cfg.remote));

  setSpeed(10); syncSettings(); syncInputs();
  Core.step(0);
  render();
  requestAnimationFrame(frame);
})();
