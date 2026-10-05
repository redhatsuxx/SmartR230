/* ===================== UI wiring ===================== */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const { cfg, F, L, act } = Core;
  const pad = n => String(n).padStart(2, '0');
  const mmss = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + pad(s % 60); };
  function fmtClock(t) {
    t = Math.floor(t);
    const d = Math.floor(t / 86400), h = Math.floor(t % 86400 / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
    return d + 'd ' + pad(h) + ':' + pad(m) + ':' + pad(s);
  }
  function fmtT(t) {
    t = Math.floor(t);
    const d = Math.floor(t / 86400), h = Math.floor(t % 86400 / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
    return (d ? d + 'd ' : '') + (d || h ? pad(h) + ':' : '') + pad(m) + ':' + pad(s);
  }
  const num = (el, v, unit, dp) => { el.innerHTML = v.toFixed(dp === undefined ? 1 : dp) + '<i>' + unit + '</i>'; };
  const signed = (v) => (v > 0.05 ? '+' : v < -0.05 ? '' : '') + v.toFixed(1);

  let speed = 10, running = true, last = performance.now();
  // M1 (starter motor) display state: flashes red while cranking, then green while the engine runs. Display only; the model starts the engine instantly.
  const CRANK_MS = 1500; let prevEng = false, crankUntil = 0;
  let lastLogN = -1, lastDtc = '';

  // Every path is drawn in one direction; `rev` flips the dash animation when current runs the other way.
  function wire(id, mode, slow, rev) {
    $(id).setAttribute('class', 'w' + (mode ? ' ' + mode : '') + (slow ? ' slow' : '') + (mode && rev ? ' rev' : ''));
  }
  const modeOf = i => (i > 0.05 ? 'chg' : i < -0.05 ? 'live' : '');

  function timerText(S) {
    if (S.mod === 'MONITORING' || S.mod === 'EMERGENCY START') return 'start window ' + Math.max(0, Math.ceil(S.monT)) + ' s';
    if (S.mod === 'SWITCH-OFF PHASE') return S.emerg ? 'K57 hold ' + mmss(S.holdT) : 'separating';
    if (S.mod === 'LIMP-HOME') {
      const left = cfg.prioMin * 60 - S.prioT;
      return S.k57 ? 'K57 quick charge ' + mmss(Math.max(0, 300 - S.runT)) : 'consumers back in ' + mmss(left);
    }
    if (S.mod === 'NORMAL MODE' && S.prio) return 'consumers back in ' + mmss(cfg.prioMin * 60 - S.prioT);
    return '';
  }

  function hintText(S) {
    if (F.burnt && (S.key || S.awake)) return 'N82/1 is dead. Nothing answers on CAN-B and no relay can be switched.';
    if (S.eng) return S.emerg ? 'Running in emergency operation. Watch the prioritisation timer.' : 'Engine running. The alternator feeds G1; the DC/DC converter tops up G1/4.';
    if (S.key && S.mod === 'MONITORING') return 'N82/1 is checking both batteries. It waits 30 s for a start signal.';
    if (S.key && S.mod === 'STANDBY') return 'N82/1 timed out waiting for a start. Remove the key and insert it again.';
    if (S.key && S.mod === 'EMERGENCY START') return 'G1/4 is carrying the system. Start the engine.';
    if (S.key) return 'Key in. Start the engine. If T30 dips below ' + cfg.thr.toFixed(1) + ' V as it starts, N82/1 closes K57.';
    if (S.awake) return 'The car is awake but will fall asleep shortly.';
    return 'Inserting the key closes the EIS microswitch and wakes N82/1.';
  }

  function render() {
    const S = Core.S, R = S.R, ld = R.ld;
    const modeShown = S.mod;

    // header chips
    $('vCar').textContent = S.awake ? 'AWAKE' : 'ASLEEP';
    $('chipCar').classList.toggle('on', S.awake);
    $('vMod').textContent = modeShown;
    $('chipMod').classList.toggle('on', modeShown !== 'STANDBY');
    $('vClock').textContent = fmtClock(S.t);
    $('vKey').textContent = S.eng ? 'engine running' : S.key ? 'key in' : 'key out';

    // controls
    $('bKeyIn').disabled = S.key;
    $('bKeyOut').disabled = !S.key;
    $('bStart').disabled = !S.key || S.eng;
    $('bStop').disabled = !S.eng;
    $('bWake').disabled = S.key || S.eng || S.canWake > 0;
    $('vNote').textContent = hintText(S);
    $('fF1').checked = F.f1; $('fF2').checked = F.f2;
    document.querySelectorAll('#faults .fault').forEach(l => l.classList.toggle('active', l.querySelector('input').checked));
    document.querySelectorAll('#loads .fault').forEach(l => l.classList.toggle('active', l.querySelector('input').checked));

    // sliders that follow the simulation
    [['rSoc1', 'oSoc1', 'sSoc1', S.soc1, Core.ocv1], ['rSoc4', 'oSoc4', 'sSoc4', S.soc4, Core.ocv4]].forEach(a => {
      const p = Math.round(a[3] * 100);
      if (document.activeElement !== $(a[0])) $(a[0]).value = p;
      $(a[1]).textContent = p + '%';
      $(a[2]).textContent = 'rest voltage ' + a[4](a[3]).toFixed(1) + ' V';
    });

    // schematic wires
    const alt = R.altOK, thru = R.link || R.dcdc;
    // G1/4 side paths run battery -> system, so charging G1/4 (I4 > 0) flows against the drawing direction.
    const rev4 = R.I4 > 0;
    wire('wB4', modeOf(R.I4), Math.abs(R.I4) < 1, rev4);
    wire('wF1a', thru && !F.f1 ? modeOf(R.I4) : '', Math.abs(R.I4) < 1, rev4);
    wire('wF1b', thru && !F.f1 ? modeOf(R.I4) : '', Math.abs(R.I4) < 1, rev4);
    wire('wK57l', R.link ? modeOf(R.I4) : '', false, rev4);
    wire('wK57r', R.link ? modeOf(R.I4) : '', false, rev4);
    // wMid is drawn module -> bus; with the alternator running, current goes bus -> module to feed G1/4.
    wire('wMid', thru ? (alt ? 'chg' : 'live') : '', false, alt);
    // wG1 is drawn bus -> G1, so only discharge runs against it.
    wire('wG1', modeOf(R.I1), Math.abs(R.I1) < 1, R.I1 < 0);
    // alternator paths are drawn bus -> G2, charging current flows from G2 into the bus.
    wire('wAlt1', alt ? 'chg' : '', false, true);
    wire('wAlt2', alt || (S.eng && !F.alt) ? 'chg' : '', false, true);
    wire('wLoad', ld.I > 0.05 ? 'live' : '', ld.I < 2);
    wire('wK75', !S.k75 && S.key ? 'live' : '', true);
    wire('wN73', S.key ? 'live' : '', true);
    wire('wCan', S.awake && !F.burnt ? 'live' : '', true);
    const blade = $('k57blade');
    if (R.link) { blade.setAttribute('x2', '355'); blade.setAttribute('y2', '60'); blade.setAttribute('class', 'blade on'); }
    else { blade.setAttribute('x2', '350'); blade.setAttribute('y2', '38'); blade.setAttribute('class', 'blade'); }
    $('k75box').setAttribute('class', 'relay-box' + (S.k75 ? ' on' : ''));
    $('modBox').style.stroke = F.burnt ? 'var(--red)' : S.mod === 'STANDBY' ? '' : '#7a828e';
    $('dcBox').style.stroke = R.dcdc ? 'var(--green)' : '';
    if (S.eng && !prevEng) crankUntil = performance.now() + CRANK_MS;
    if (!S.eng && prevEng) crankUntil = 0;
    prevEng = S.eng;
    const cranking = performance.now() < crankUntil;
    $('m1c').setAttribute('class', 'box' + (cranking ? ' m1-crank' : S.eng ? ' m1-run' : ''));
    $('svMode').textContent = modeShown;
    $('svTimer').textContent = timerText(S);
    $('svBurnt').textContent = F.burnt ? 'BCM BURNT BOARD' : '';
    $('sv4v').textContent = R.V4.toFixed(1) + ' V';
    $('sv4s').textContent = Math.round(S.soc4 * 100) + '%';
    $('sv1v').textContent = R.V30.toFixed(1) + ' V';
    $('sv1s').textContent = Math.round(S.soc1 * 100) + '%';
    $('sv4c').textContent = 'lead-acid ' + cfg.cap4 + ' Ah';
    $('sv1c').textContent = 'AGM ' + cfg.cap1 + ' Ah' + (F.bad ? ' weak' : '');
    $('b1').style.stroke = R.V30 < cfg.thr ? 'var(--red)' : '';
    $('b4').style.stroke = F.f1 ? 'var(--amber)' : '';
    $('g2c').style.stroke = F.alt ? 'var(--red)' : '';
    $('svG2').textContent = F.alt ? 'FAILED' : alt ? Core.consts.ALT_V.toFixed(1) + ' V' : S.eng ? 'cut off' : 'idle';
    $('svLoad').textContent = ld.I.toFixed(1) + ' A';
    $('svSock').textContent = S.k75 ? 'cut by K75' : 'powered';
    $('fuse1').setAttribute('class', 'fuse' + (F.f1 ? ' blown' : ''));
    $('fuse2').setAttribute('class', 'fuse' + (F.f2 ? ' blown' : ''));
    $('svF1').textContent = F.f1 ? 'BLOWN' : 'intact';
    $('svF2').textContent = F.f2 ? 'BLOWN' : 'intact';

    // cluster
    const d = Core.dash();
    const mfd = $('mfd');
    mfd.className = 'mfd c' + d.cat + (d.off ? ' off' : '');
    $('mfdMsg').innerHTML = d.off ? '&nbsp;' : d.msg;
    let sub = d.off ? '' : d.sub;
    if (d.cat === 2 && S.prio) sub += ' · consumers back in ' + mmss(cfg.prioMin * 60 - S.prioT);
    $('mfdSub').textContent = sub || ' ';
    $('mfdIcon').style.color = d.cat === 1 ? '#ff6b6f' : d.cat === 2 ? '#bfe0ff' : '#5a6069';
    $('mfdIcon').style.display = d.cat === 0 ? 'none' : '';
    $('vCl').textContent = d.off ? 'display off' : d.cat === 1 ? 'category 1 (red)' : d.cat === 2 ? 'category 2 (blue)' : 'display on';
    $('vRpm').textContent = S.eng && !d.off ? '750' : '0';
    $('vSpd').textContent = '0';

    // readings
    num($('rT30'), R.V30, 'V'); num($('rV4'), R.V4, 'V');
    $('stT30').className = 'stat' + (R.V30 < cfg.thr ? ' bad' : R.V30 < cfg.thr + 0.5 ? ' warn' : '');
    $('stV4').className = 'stat' + (R.V4 < 11.9 ? ' bad' : R.V4 < 12.2 && !R.dcdc && !R.link && !alt ? ' warn' : '');
    num($('rLoad'), ld.I, 'A', ld.I < 1 ? 2 : 1); num($('rAlt'), alt ? R.Ialt : 0, 'A');
    num($('rI1'), R.I1, 'A', Math.abs(R.I1) < 1 ? 2 : 1); num($('rI4'), R.I4, 'A', Math.abs(R.I4) < 1 ? 2 : 1);
    [['rS1', 'bar1', S.soc1], ['rS4', 'bar4', S.soc4]].forEach(a => {
      $(a[0]).textContent = (a[2] * 100).toFixed(1) + '%';
      const bar = $(a[1]);
      bar.firstElementChild.style.width = (a[2] * 100) + '%';
      bar.className = 'bar' + (a[2] < 0.15 ? ' crit' : a[2] < 0.3 ? ' low' : '');
    });
    $('rCrank').textContent = S.lastCrank === null ? '–' : S.lastCrank.toFixed(1) + ' V | ' + (S.lastCrank30 === undefined ? '–' : S.lastCrank30.toFixed(1) + ' V');
    $('k57hint').textContent = F.burnt ? 'N82/1 is dead, so nothing can command K57.'
      : S.emerg ? 'N82/1 is holding K57 until T30 recovers and the timers finish.'
      : 'K57 closes when T30 falls below ' + cfg.thr.toFixed(1) + ' V: at wake-up, as the engine starts and cranks, or while running if the alternator fails. Load the "Weak G1" scenario, insert the key and start the engine.';
    const tt = timerText(S);
    $('rTim').textContent = tt ? tt.replace(/^.* (\d+:\d\d|\d+ s)$/, '$1') : '–';

    // outputs
    $('vPrio').textContent = S.prio ? 'prioritisation active' : 'normal';
    const set = (id, txt, cut) => { $(id).textContent = txt; $(id).parentElement.classList.toggle('cut', !!cut); };
    set('oK57', R.link ? 'closed' : S.k57 ? 'energised, no link' : 'open', R.link);
    set('oK75', S.k75 ? 'open (sockets cut)' : 'closed', S.k75);
    const on = S.key;
    set('oBlowV', !on || !L.blow ? 'off' : ld.capped ? ld.blow + '% (capped)' : ld.blow + '%', ld.capped);
    set('oDefV', !on || !L.def ? 'off' : ld.def ? 'on' : 'cut', on && L.def && !ld.def);
    set('oSeatV', !on || !L.seat ? 'off' : ld.seat ? 'on' : 'cut', on && L.seat && !ld.seat);
    set('oAudV', !on || !L.aud ? 'off' : S.prio ? 'limited' : 'normal', on && L.aud && S.prio);

    // fault memory
    const dj = JSON.stringify(S.dtc);
    if (dj !== lastDtc) {
      lastDtc = dj;
      const ul = $('dtcList'); ul.textContent = '';
      if (!S.dtc.length) { const li = document.createElement('li'); li.className = 'none'; li.textContent = 'No entries'; ul.appendChild(li); }
      S.dtc.forEach(x => { const li = document.createElement('li'); li.textContent = x.label; ul.appendChild(li); });
      $('bClear').disabled = !S.dtc.length;
    }

    // event log
    if (S.logN !== lastLogN) {
      lastLogN = S.logN;
      const ul = $('log'); ul.textContent = '';
      S.log.forEach(e => {
        const li = document.createElement('li');
        const t = document.createElement('time'); t.textContent = fmtT(e.t);
        const g = document.createElement('span'); g.className = 'tag t-' + (e.src === 'DOC' ? 'doc' : e.src === 'USER' ? 'user' : e.src === 'DEMO' ? 'demo' : 'model'); g.textContent = e.src;
        const m = document.createElement('span'); m.textContent = e.msg;
        li.append(t, g, m); ul.appendChild(li);
      });
    }
  }

  /* ---- demos ---- */
  const fmtSpeed = n => (n >= 3600 ? (n / 3600) + ' h/s' : n + '\u00d7');
  function setSpeed(n) {
    speed = n;
    $('segSpeed').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', +x.dataset.s === n ? 'true' : 'false'));
    $('oSpeed').textContent = fmtSpeed(n);
  }
  function syncSettings() {
    $('rThr').value = cfg.thr; $('oThr').textContent = cfg.thr.toFixed(1) + ' V';
    $('rPrio').value = cfg.prioMin; $('oPrio').textContent = cfg.prioMin + ' min';
    const mA = Math.round(cfg.sleepA * 1000);
    $('rSleep').value = mA; $('oSleep').textContent = mA + ' mA';
    $('rBlow').value = L.blowPct; $('oBlow').textContent = L.blowPct + '%';
  }
  function demoUi(on, title) {
    $('demoBar').hidden = !on;
    if (title) $('demoTitle').textContent = title;
    document.querySelectorAll('#demoList button').forEach(b => b.setAttribute('aria-current', on && b.dataset.id === curDemo ? 'true' : 'false'));
  }
  let curDemo = null;
  function stopDemo() { Demos.stop(); curDemo = null; demoUi(false); }
  function startDemo(id) {
    const d = Demos.start(id); if (!d) return;
    curDemo = id; running = true; $('bRun').textContent = 'Pause';
    lastLogN = -1; lastDtc = '';
    syncSettings(); syncInputs();
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

  /* ---- loop ---- */
  function frame(now) {
    const real = Math.min(0.1, (now - last) / 1000); last = now;
    if (running) {
      const r = Demos.tick(real);
      if (r) {
        if (r.speed) setSpeed(r.speed);
        if (r.say) $('demoSay').textContent = r.say;
        if (r.fired) { syncInputs(); syncSettings(); }
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
  $('bStart').onclick = () => { crankUntil = performance.now() + CRANK_MS; act.start(); poke(); };
  $('bStop').onclick = () => { act.stop(); poke(); };
  $('bWake').onclick = () => { act.canWake(); poke(); };
  $('bDemoStop').onclick = () => { stopDemo(); setSpeed(10); };
  $('bClear').onclick = () => { act.clearDtc(); poke(); };

  $('bRun').onclick = () => { running = !running; $('bRun').textContent = running ? 'Pause' : 'Resume'; };
  $('segSpeed').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    setSpeed(+b.dataset.s);
  });

  function syncInputs() {
    $('fBurnt').checked = F.burnt; $('fBad').checked = F.bad; $('fAlt').checked = F.alt;
    $('fF1').checked = F.f1; $('fF2').checked = F.f2; $('fK57').checked = F.k57;
    $('lHead').checked = L.head; $('lBlow').checked = L.blow; $('lDef').checked = L.def;
    $('lSeat').checked = L.seat; $('lAud').checked = L.aud;
    $('rExtra').value = L.extra; $('oExtra').textContent = L.extra + ' A';
  }
  $('bReset').onclick = () => { stopDemo(); Core.reset(); lastLogN = -1; lastDtc = ''; poke(); };
  $('scen').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    stopDemo(); Core.reset(b.dataset.sc); syncInputs(); lastLogN = -1; lastDtc = '';
    Core.S.log.shift();
    const names = { healthy: 'healthy car', weak: 'weak systems battery', alt: 'dead alternator', burnt: 'burnt BCM N82/1', f52f1: 'blown F52f1 with a weak systems battery' };
    Core.S.log.unshift({ t: 0, src: 'USER', msg: 'Scenario loaded: ' + names[b.dataset.sc] + '. Insert the key to begin.' });
    Core.S.logN++;
    poke();
  });

  const fmap = { fBurnt: 'burnt', fBad: 'bad', fAlt: 'alt', fF1: 'f1', fF2: 'f2', fK57: 'k57' };
  Object.keys(fmap).forEach(id => { $(id).onchange = () => { act.fault(fmap[id], $(id).checked); poke(); }; });
  const lmap = { lHead: 'head', lBlow: 'blow', lDef: 'def', lSeat: 'seat', lAud: 'aud' };
  Object.keys(lmap).forEach(id => { $(id).onchange = () => { L[lmap[id]] = $(id).checked; poke(); }; });
  $('rExtra').oninput = () => { L.extra = +$('rExtra').value; $('oExtra').textContent = L.extra + ' A'; poke(); };
  $('rBlow').oninput = () => { L.blowPct = +$('rBlow').value; $('oBlow').textContent = L.blowPct + '%'; poke(); };

  $('rThr').oninput = () => { cfg.thr = +$('rThr').value; $('oThr').textContent = cfg.thr.toFixed(1) + ' V'; poke(); };
  $('rPrio').oninput = () => { cfg.prioMin = +$('rPrio').value; $('oPrio').textContent = cfg.prioMin + ' min'; poke(); };
  $('rSleep').oninput = () => { const mA = +$('rSleep').value; cfg.sleepA = mA / 1000; $('oSleep').textContent = mA + ' mA'; poke(); };
  $('rSoc1').oninput = () => { Core.setSoc(1, +$('rSoc1').value / 100); poke(); };
  $('rSoc4').oninput = () => { Core.setSoc(4, +$('rSoc4').value / 100); poke(); };
  $('nCap1').onchange = () => { cfg.cap1 = Math.min(150, Math.max(20, +$('nCap1').value || 70)); $('nCap1').value = cfg.cap1; poke(); };
  $('nCap4').onchange = () => { cfg.cap4 = Math.min(150, Math.max(20, +$('nCap4').value || 35)); $('nCap4').value = cfg.cap4; poke(); };

  ['fuse1', 'fuse2'].forEach((id, i) => {
    const el = $(id);
    el.addEventListener('click', () => { act.blowFuse(i + 1); poke(); });
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act.blowFuse(i + 1); poke(); } });
  });

  syncInputs();
  Core.step(0);
  render();
  requestAnimationFrame(frame);
})();
