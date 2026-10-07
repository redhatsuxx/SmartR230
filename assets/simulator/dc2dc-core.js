/* ===================================================================
   DC2DC conversion model. No DOM access in this block.
   N82/1 is removed. A DC2DC charger (12/12-50A, non-isolated)
   tops up the starter battery, a manual isolator replaces K57, and the
   SmartR230 answers for the missing module on CAN-B.
   Source tags: SPEC = charger maker's published figure (check the datasheet),
                USER = value supplied by Glenn, MODEL = simulator assumption.
   =================================================================== */
const Core = (function () {
  'use strict';

  const ALT_V = 14.1;        // USER  alternator output voltage
  const ALT_MAX = 120;       // MODEL alternator capacity, amps
  const RALT = 0.0004;       // MODEL alternator-to-battery path resistance, ohms
  const EFF = 0.985;         // SPEC   converter efficiency
  const CRANK_A = 180;       // MODEL starter current from G1/4
  const CRANK_MIN_V = 8.0;   // MODEL below this the starter will not turn
  const ECU_MIN_V = 9.0;     // MODEL below this the control units brown out
  const CRANK_LOAD = 25;     // MODEL extra amps on G1 while cranking
  const CAR_SLEEP_DELAY = 18;// USER  time from key out to bus asleep
  const MON_WINDOW = 30;     // MODEL a CAN-B wake keeps the bus up this long
  const EMU_SLEEP = 300;     // SmartR230: deep sleep 5 minutes after the last master signal
  const WIFI_CUT = 20;       // SmartR230: Wi-Fi shuts off 20 s before sleep
  const REV_A = 25;          // SPEC   emergency reverse charge current
  const REV_CHARGE_S = 900;  // SPEC   15 minutes
  const REV_SETTLE_S = 300;  // SPEC   5 minutes
  const HEAT_BLOW = 120;     // MODEL fuse heat that blows it

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ocv1 = s => 11.7 + 1.15 * s - (s < 0.05 ? (0.05 - s) * 60 : 0);
  const ocv4 = s => 11.9 + 0.75 * s - (s < 0.05 ? (0.05 - s) * 60 : 0);
  const soc1FromV = v => clamp((v - 11.7) / 1.15, 0, 1);

  const MODS = [
    { id: 'eis', name: 'EIS' }, { id: 'sam', name: 'SAM' }, { id: 'rsam', name: 'Rear SAM' },
    { id: 'pse', name: 'PSE' }, { id: 'roof', name: 'Roof' }, { id: 'clu', name: 'Cluster' },
    { id: 'clim', name: 'Climate' }, { id: 'door', name: 'Driver door' },
    { id: 'park', name: 'Parktronic' }, { id: 'seat', name: 'Seat heater' }
  ];
  const SUSPECTS = ['Driver door', 'Climate', 'Parktronic', 'Seat heater', 'Rear SAM'];

  const cfg = {
    sleepA: 0.02, cap1: 70, cap4: 35, rw: 0.0008, rlink: 0.015,
    emu: 'on', remote: true, modMinV: 10.8, suspect: 'Parktronic',
    emuAwakeA: 0.06, emuQuietA: 0.02, emuSleepA: 0.001, awakeA: 0.9, loopA: 4,
    o: { vStart: 14.0, vStop: 13.1, tStart: 10, tStop: 10, limOut: 40, limIn: 50, vLockOut: 12.5, vLockIn: 12.8, idleA: 0 },
    fuse: { in: 60, out: 60, link: 20, f2: 200 }
  };
  const F = { bad: false, alt: false, revpol: false, wake: 'none', fuse: { in: false, out: false, link: false, f2: false } };
  const L = { head: false, blow: false, def: false, seat: false, aud: false, blowPct: 100, extra: 0 };
  let S = null;
  let seen = new Set();

  function fresh(soc1, soc4) {
    return {
      t: 0, key: false, eng: false, canWake: 0, sleepT: 0, awake: false, pwr: true,
      soc1, soc4, iso: false, loopT: 35, burst: false, cycles: 0, tally: {},
      orion: { st: 'WAITING', tmr: 0, stopT: 0, dead: false },
      emu: { st: 'QUIET', t: 0, seen: false, wifiDead: false, deep: false },
      heat: { in: 0, out: 0, link: 0, f2: 0 },
      clk: { dd: 1, hh: 3, mm: 17, t0: 0 },
      dtc: [], log: [], logN: 0, lastCrank: null, R: null
    };
  }

  function log(src, msg) {
    S.log.unshift({ t: S.t, src, msg });
    if (S.log.length > 100) S.log.pop();
    S.logN++;
  }
  function logOnce(key, src, msg) { if (!seen.has(key)) { seen.add(key); log(src, msg); } }
  function addDtc(id, label) { if (!S.dtc.some(d => d.id === id)) S.dtc.push({ id, label }); }

  const isMaster = () => S.key || S.eng || S.sleepT > 0 || S.canWake > 0;

  /* ---- loads on the bus (amps) ---- */
  function emuDraw() {
    if (cfg.emu !== 'on' || !S.pwr) return 0;
    return S.emu.st === 'DEEP' ? cfg.emuSleepA : S.emu.st === 'QUIET' ? cfg.emuQuietA : cfg.emuAwakeA;   // USER: about 40 mA total with the bus quiet, about 20 mA in deep sleep
  }
  function loads() {
    const out = { I: 0, blow: 0, def: false, seat: false, aud: 0, emu: emuDraw() };
    if (!S.awake) { out.I = cfg.sleepA + out.emu; return out; }
    if (!S.key && !S.eng) {
      out.I = (S.burst ? cfg.loopA : cfg.awakeA) + out.emu;
      return out;
    }
    out.I = (S.eng ? 22 : 14) + L.extra + out.emu;
    if (L.head) out.I += 10;
    if (L.blow) { out.blow = L.blowPct; out.I += 30 * L.blowPct / 100; }
    if (L.def) { out.def = true; out.I += 25; }
    if (L.seat) { out.seat = true; out.I += 18; }
    if (L.aud) { out.aud = 2; out.I += 4; }
    return out;
  }

  /* ---- solve the whole circuit for this instant ---- */
  function electrical() {
    const capEff1 = cfg.cap1 * (F.bad ? 0.45 : 1);
    const R1 = (0.006 + (1 - S.soc1) * 0.006) * (F.bad ? 6 : 1);
    const R4 = 0.01 + (1 - S.soc4) * 0.02;
    const E1 = ocv1(S.soc1), E4 = ocv4(S.soc4);
    const ld = loads();
    const O = S.orion, o = cfg.o;
    const inOK = !F.fuse.in, outOK = !F.fuse.out;
    const orionOK = !O.dead && cfg.remote && inOK && outOK;
    const fwd = orionOK && O.st === 'CHARGING';
    const rev = orionOK && O.st === 'REVERSE';
    const linkOn = S.iso && !F.fuse.link;
    const Rl = cfg.rlink;
    const idle = (!O.dead && cfg.remote && inOK) ? o.idleA : 0;
    const altOK = S.eng && !F.alt && !F.fuse.f2;
    const acc1 = capEff1 * 0.8 * (1 - S.soc1) + 0.7;
    const acc4 = cfg.cap4 * clamp(0.9 * (1 - S.soc4), 0.04, 0.6);
    let Vb, Vs, Il = 0, Iout = 0, Iin = idle, I1, I4, Ialt = 0;

    if (altOK) {
      Vb = ALT_V; Vs = E4;
      for (let k = 0; k < 4; k++) {
        if (fwd) Vs = Math.min(14.4, Vb - 0.05);                  // USER: output sits close to the alternator voltage while charging
        Il = linkOn ? Math.min(acc4, Math.max(0, fwd ? (Vb - Vs) / Rl : (Vb - E4) / (Rl + R4))) : 0;
        Iout = fwd ? Math.min(o.limOut, Math.max(0, acc4 - Il), o.limIn * Vb * EFF / Math.max(Vs, 10)) : 0;
        if (!fwd) Vs = E4 + (Il + Iout) * R4;
        Iin = idle + (fwd ? Iout * Vs / (Vb * EFF) : 0);
        const c1 = Math.min(acc1, Math.max(0, (Vb - E1) / R1));
        const base = ld.I + Iin + Il;
        const avail = ALT_MAX - base;
        I1 = avail >= 0 ? Math.min(c1, avail) : avail;
        Ialt = base + I1;
        Vb = ALT_V - RALT * Ialt - (avail < 0 ? Math.min(1.2, -avail * 0.02) : 0);
      }
      I4 = Il + Iout;
    } else {
      const Eapp = E1;
      if (fwd) Iout = Math.min(o.limOut, acc4);
      if (rev) Iout = -(S.soc4 > 0.08 ? REV_A : 0);
      if (fwd) Iin = idle + Iout * E4 / (Eapp * EFF);
      if (rev) Iin = idle + Iout * E4 * EFF / Math.max(Eapp, 8);
      if (linkOn) {
        const a = 1 / R1 + 1 / Rl, b = -1 / Rl, c = E1 / R1 - ld.I - Iin;
        const d = -1 / Rl, e = 1 / R4 + 1 / Rl, f = E4 / R4 + Iout;
        const det = a * e - b * d;
        Vb = (c * e - b * f) / det; Vs = (a * f - d * c) / det;
        I1 = (Vb - E1) / R1; I4 = (Vs - E4) / R4; Il = (Vb - Vs) / Rl;
      } else {
        Vb = E1 - R1 * (ld.I + Iin); Vs = E4 + R4 * Iout;
        I1 = -(ld.I + Iin); I4 = Iout;
      }
    }
    const Vin = altOK ? Vb - cfg.rw * Math.max(0, Ialt) : Vb;
    return { Vb, Vs, Vin, Il, Iout, Iin, I1, I4, Ialt, ld, E1, E4, R1, R4, capEff1, altOK, fwd, rev, linkOn, orionOK, acc4 };
  }

  /* Can the modules (EIS included) run? Test the bus voltage they would see once awake and loading it. */
  function canPower() {
    const a = S.awake; S.awake = true;
    const el = electrical();
    S.awake = a;
    return el.Vb >= cfg.modMinV;
  }

  /* ---- DC2DC state machine ---- */
  function orionStep(dt) {
    const O = S.orion, o = cfg.o, R = S.R;
    if (O.dead) { O.st = 'DEAD'; return; }
    if (F.revpol) {
      O.dead = true; O.st = 'DEAD';
      log('MODEL', 'Battery leads connected the wrong way round. The DC2DC charger has no reverse-polarity protection and is destroyed.');
      return;
    }
    if (!cfg.remote) {
      if (O.st !== 'OFF') log('SPEC', 'The remote LINK is open. The DC2DC charger switches itself off and never charges.');
      O.st = 'OFF'; O.tmr = 0; O.stopT = 0; return;
    }
    const inOK = !F.fuse.in, outOK = !F.fuse.out;
    if (!inOK && !outOK) { O.st = 'NO POWER'; return; }
    if (!inOK) { O.st = 'NO INPUT'; return; }
    if (!outOK) { O.st = 'NO OUTPUT'; return; }
    const Vin = R.Vin;
    switch (O.st) {
      case 'REVERSE':
        O.tmr -= dt;
        if (Vin >= o.vStart) { O.st = 'WAITING'; log('SPEC', 'Engine detected during reverse charge. Reverse charge ends.'); }
        else if (O.tmr <= 0) { O.st = 'SETTLE'; O.tmr = REV_SETTLE_S; log('SPEC', 'Reverse charge done. The DC2DC charger settles for about 5 minutes.'); }
        break;
      case 'SETTLE':
        O.tmr -= dt;
        if (O.tmr <= 0) { O.st = 'WAITING'; log('SPEC', 'Settle time over. The DC2DC charger is waiting for the engine again.'); }
        break;
      case 'CHARGING':
        if (Vin < o.vLockOut) {
          O.st = 'LOCKOUT'; O.stopT = 0;
          log('SPEC', 'Input fell below ' + o.vLockOut.toFixed(1) + ' V. The DC2DC charger locks out at once so it cannot flatten G1.');
        } else if (Vin < o.vStop) {
          O.stopT += dt;
          if (O.stopT >= o.tStop) { O.st = 'WAITING'; O.stopT = 0; log('SPEC', 'Input below ' + o.vStop.toFixed(1) + ' V for ' + o.tStop + ' s. Engine treated as stopped; charging ends.'); }
        } else O.stopT = 0;
        break;
      case 'LOCKOUT':
        if (Vin >= o.vLockIn) { O.st = 'WAITING'; log('SPEC', 'Input recovered above ' + o.vLockIn.toFixed(1) + ' V. Lockout released.'); }
        break;
      case 'START DELAY':
        if (Vin < o.vStart) { O.st = 'WAITING'; }
        else { O.tmr -= dt; if (O.tmr <= 0) { O.st = 'CHARGING'; O.stopT = 0; log('SPEC', 'Input held above ' + o.vStart.toFixed(1) + ' V. Engine detected, so charging starts.'); } }
        break;
      default:
        if (Vin >= o.vStart && Vin >= o.vLockIn) { O.st = 'START DELAY'; O.tmr = o.tStart; }
        else O.st = 'WAITING';
    }
  }

  function fuseStep(dt, el) {
    const cur = { in: Math.abs(el.Iin), out: Math.abs(el.Iout), link: Math.abs(el.Il), f2: el.Ialt };
    const names = { in: 'DC2DC input fuse', out: 'DC2DC output fuse', link: 'Isolator link fuse (20 A)', f2: 'Alternator fuse F52f2' };
    let blew = false;
    ['in', 'out', 'link', 'f2'].forEach(k => {
      if (F.fuse[k]) { S.heat[k] = 0; return; }
      const r = cur[k] / cfg.fuse[k];
      if (r > 1) S.heat[k] += (r * r - 1) * dt; else S.heat[k] = Math.max(0, S.heat[k] - 0.5 * dt);
      if (S.heat[k] >= HEAT_BLOW) {
        F.fuse[k] = true; S.heat[k] = 0; blew = true;
        log('MODEL', names[k] + ' blows: ' + cur[k].toFixed(0) + ' A through a ' + cfg.fuse[k] + ' A fuse.');
      }
    });
    return blew;
  }

  /* ---- SmartR230 emulator ---- */
  function emuStep(dt, master, busAwake) {
    let E = S.emu;
    if (cfg.emu === 'on' && !S.pwr) { S.emu = { st: 'OFF', t: 0, seen: false, wifiDead: false, deep: false }; return; }
    if (cfg.emu !== 'on') { E.st = cfg.emu === 'off' ? 'OFF' : 'NONE'; return; }
    if (master) { E.seen = true; E.t = 0; } else if (E.seen) E.t += dt;
    if (E.seen && !E.wifiDead && E.t >= EMU_SLEEP - WIFI_CUT) {
      E.wifiDead = true; log('MODEL', 'SmartR230 Wi-Fi shuts off, 20 s before sleep. It stays off until the device reboots.');
    }
    if (busAwake) {
      if (E.deep) { E.deep = false; E.wifiDead = false; log('MODEL', 'The bus woke the SmartR230 from deep sleep. It reboots with Wi-Fi back on.'); }
      E.st = 'AWAKE';
    } else if (E.seen && E.t >= EMU_SLEEP) {
      if (E.st !== 'DEEP') log('MODEL', 'Five minutes since the last master signal: SmartR230 enters deep sleep and the LED goes off.');
      E.st = 'DEEP'; E.deep = true;
    } else E.st = 'QUIET';
  }

  /* ---- one simulation step ---- */
  function step(dt) {
    S.t += dt;
    if (S.canWake > 0) S.canWake = Math.max(0, S.canWake - dt);
    if (S.sleepT > 0) S.sleepT = Math.max(0, S.sleepT - dt);
    const master = isMaster();

    // wake-fault bursts (the suspect module keeps the bus up with no master signal)
    if (F.wake === 'loop') {
      if (master) S.loopT = 35;
      else S.loopT += dt;
      const on = !master && (S.loopT % 45) >= 35;
      if (on && !S.burst) {
        S.cycles++; S.tally[cfg.suspect] = (S.tally[cfg.suspect] || 0) + 1;
        log('MODEL', cfg.suspect + ' wakes the bus with no master signal (cycle ' + S.cycles + ').');
      }
      S.burst = on;
    } else S.burst = false;
    const pw = canPower();
    if (pw !== S.pwr) {
      S.pwr = pw;
      log('MODEL', pw ? 'The bus holds ' + cfg.modMinV.toFixed(1) + ' V or more under load again: the modules, including the EIS, power up.'
                       : 'The bus would fall below ' + cfg.modMinV.toFixed(1) + ' V under load: the modules, including the EIS, have no power and nothing can wake.');
    }
    if (S.key && !S.pwr) logOnce('eisdead', 'MODEL', 'Key is in but the EIS has no power, so nothing wakes and the engine cannot start. Close the isolator to power the modules from G1/4.');
    const busAwake = S.pwr && (master || F.wake === 'stuck' || S.burst);

    const wasAwake = S.awake;
    S.awake = busAwake;
    if (wasAwake && !S.awake) log('MODEL', 'The CAN-B bus goes quiet. Control units sleep; the parasitic draw is now the only load on G1.');
    if (!wasAwake && S.awake && !master) logOnce('wk' + F.wake + Math.floor(S.t / 60), 'MODEL', 'Bus traffic with no master signal.');

    emuStep(dt, master, busAwake);
    if (S.awake && (S.key || S.eng) && cfg.emu !== 'on') {
      logOnce('missing', 'MODEL', 'Nothing answers for N82/1 on CAN-B. The cluster shows a battery fault.');
      addDtc('N82', 'Power supply module (N82/1) not answering on CAN-B');
    }

    orionStep(dt);
    let el = electrical();
    if (fuseStep(dt, el)) el = electrical();
    S.R = el;

    if (S.eng && el.Vb < ECU_MIN_V) {
      S.eng = false;
      log('MODEL', 'Voltage on the bus fell below ' + ECU_MIN_V.toFixed(1) + ' V. Engine management drops out and the engine stalls.');
    }

    const eff = q => (q > 0 ? q * 0.95 : q);
    S.soc1 = clamp(S.soc1 + eff(el.I1 * dt) / (el.capEff1 * 3600), 0, 1);
    S.soc4 = clamp(S.soc4 + eff(el.I4 * dt) / (cfg.cap4 * 3600), 0, 1);
  }

  /* ---- operator actions ---- */
  const act = {
    keyIn() {
      if (S.key) return;
      S.key = true; S.sleepT = 0; seen.delete('missing'); seen.delete('eisdead');
      log('USER', 'Key inserted. The EIS wakes the CAN-B bus.');
    },
    keyOut() {
      if (!S.key) return;
      S.key = false;
      if (S.eng) { S.eng = false; log('USER', 'Key removed with the engine running: engine stops.'); }
      else log('USER', 'Key removed.');
      S.sleepT = CAR_SLEEP_DELAY;
    },
    canWake() {
      if (S.awake || !S.pwr) return;
      S.canWake = MON_WINDOW;
      log('USER', 'A CAN-B message wakes the car.');
    },
    start() {
      if (!S.key || S.eng) return;
      if (!S.pwr) { log('MODEL', 'The EIS has no power (bus below ' + cfg.modMinV.toFixed(1) + ' V), so the car cannot start even though G1/4 is good. Close the isolator to link G1/4 to the modules.'); return; }
      const el = S.R = electrical();
      if (el.Vb < ECU_MIN_V) {
        log('MODEL', 'Only ' + el.Vb.toFixed(1) + ' V on the bus. The control units cannot run, so the engine will not start. Close the isolator to borrow the starter battery, or reverse-charge G1.');
        return;
      }
      const Vc = el.E4 - CRANK_A * el.R4;
      S.lastCrank = Vc;
      if (Vc < CRANK_MIN_V) {
        log('MODEL', 'Starter battery dips to ' + Vc.toFixed(1) + ' V under cranking. The starter will not turn.');
        return;
      }
      const Vbc = el.linkOn ? Vc : el.E1 - (el.ld.I + CRANK_LOAD) * el.R1;
      S.lastCrank30 = Vbc;
      if (Vbc < ECU_MIN_V) {
        log('MODEL', 'The bus dips to ' + Vbc.toFixed(1) + ' V while cranking. Engine management drops out and the engine does not start.');
        return;
      }
      S.soc4 = clamp(S.soc4 - (CRANK_A * 2) / (cfg.cap4 * 3600), 0, 1);
      S.eng = true; S.sleepT = 0;
      log('USER', 'Engine started. Starter battery dipped to ' + Vc.toFixed(1) + ' V.');
    },
    stop() {
      if (!S.eng) return;
      S.eng = false;
      log('USER', 'Engine stopped.');
    },
    clearDtc() { S.dtc = []; log('USER', 'Fault memory cleared with a diagnostic tool.'); },
    blowFuse(key) {
      F.fuse[key] = !F.fuse[key];
      S.heat[key] = 0;
      const nm = { in: 'DC2DC input fuse', out: 'DC2DC output fuse', link: 'Isolator link fuse', f2: 'Alternator fuse F52f2' }[key];
      log('USER', nm + (F.fuse[key] ? ' blown.' : ' replaced.'));
    },
    iso(on) {
      if (S.iso === on) return;
      S.iso = on;
      log('USER', on ? 'Isolator switch closed: G1 and G1/4 are linked through the 20 A fuse.' : 'Isolator switch opened.');
    },
    link(on) {
      if (cfg.remote === on) return;
      cfg.remote = on;
      log('USER', on ? 'Remote LINK jumper fitted: the DC2DC charger is enabled.' : 'Remote LINK jumper removed: the DC2DC charger is off.');
    },
    reverse() {
      const O = S.orion;
      if (S.eng || O.dead || !cfg.remote || F.fuse.in || F.fuse.out) { log('MODEL', 'Emergency reverse charge is not possible right now (engine must be off, the DC2DC charger alive, the link fitted and both fuses intact).'); return; }
      if (O.st === 'REVERSE') return;
      if (S.soc4 <= 0.08) { log('MODEL', 'G1/4 is too flat to reverse-charge G1.'); return; }
      O.st = 'REVERSE'; O.tmr = REV_CHARGE_S;
      log('SPEC', 'Emergency reverse charge started: ' + REV_A + ' A from G1/4 into G1 for 15 minutes.');
    },
    fault(name, on) {
      if (F[name] === on) return;
      F[name] = on;
      const lab = { bad: 'Weak systems battery', alt: 'Alternator failure', revpol: 'Reverse polarity connection' }[name];
      log('USER', lab + (on ? ' injected.' : ' removed.'));
      if (on && name === 'alt') addDtc('G2', 'Alternator output missing');
      seen.clear();
    },
    setWake(mode) {
      if (F.wake === mode) return;
      F.wake = mode; S.loopT = 35; S.cycles = mode === 'none' ? S.cycles : 0; if (mode !== 'none') S.tally = {};
      log('USER', mode === 'none' ? 'Wake fault cleared.' : (mode === 'stuck' ? 'Stuck awake: ' : 'Sleep/wake loop: ') + cfg.suspect + ' keeps waking the bus.');
    },
    setEmu(mode) {
      if (cfg.emu === mode) return;
      cfg.emu = mode;
      S.emu = { st: mode === 'on' ? 'QUIET' : (mode === 'off' ? 'OFF' : 'NONE'), t: 0, seen: false, wifiDead: false, deep: false };
      seen.delete('missing');
      log('USER', mode === 'on' ? 'SmartR230 fitted and powered. It boots and starts listening on CAN-B.' : mode === 'off' ? 'SmartR230 unplugged.' : 'No SmartR230 fitted.');
    },
    setClock(dd, hh, mm) {
      if (!clockAllowed()) return false;
      S.clk = { dd, hh, mm, t0: S.t };
      log('USER', 'Dash clock set to day ' + dd + ', ' + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ' through the SmartR230.');
      return true;
    },
    jumpToSleep() {
      if (cfg.emu !== 'on') return;
      S.emu.seen = true;
      if (!isMaster()) S.emu.t = Math.max(S.emu.t, EMU_SLEEP - 25);
    }
  };

  /* ---- derived outputs ---- */
  const clockAllowed = () => cfg.emu === 'on' && isMaster();
  function clockNow() {
    const c = S.clk;
    const sec = c.hh * 3600 + c.mm * 60 + (S.t - c.t0);
    const days = Math.floor(sec / 86400);
    const r = sec - days * 86400;
    return { dd: (c.dd - 1 + days) % 31 + 1, hh: Math.floor(r / 3600), mm: Math.floor(r % 3600 / 60) };
  }
  function dash() {
    const on = S.awake && (S.key || S.eng) && S.R && S.R.Vb > 6;
    if (!on) return { off: true, cat: 0, msg: '', sub: '' };
    if (cfg.emu !== 'on') return { cat: 1, msg: 'Battery fault', sub: 'Visit workshop' };
    return { cat: 0, msg: 'No messages', sub: '' };
  }
  function led() {
    if (cfg.emu === 'none') return 'none';
    if (cfg.emu === 'off') return 'off';
    return S.emu.st === 'AWAKE' ? 'flash' : S.emu.st === 'QUIET' ? 'steady' : 'off';
  }
  const wifiOn = () => cfg.emu === 'on' && (S.emu.st === 'AWAKE' || S.emu.st === 'QUIET') && !S.emu.wifiDead;
  function mods() {
    const sus = (F.wake !== 'none') ? cfg.suspect : null;
    return MODS.map(m => ({ id: m.id, name: m.name, awake: S.awake, suspect: !!sus && m.name === sus && (S.burst || F.wake === 'stuck') }));
  }
  function stage() {
    const O = S.orion;
    if (O.st !== 'CHARGING') return '–';
    return S.soc4 < 0.8 ? 'BULK' : S.soc4 < 0.95 ? 'ABSORPTION' : 'FLOAT';
  }
  const mmss = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function device() {
    const E = S.emu, master = isMaster();
    const seen_ = E.seen;
    const left = seen_ ? Math.max(0, EMU_SLEEP - E.t) : EMU_SLEEP;
    const wifi = seen_ ? Math.max(0, EMU_SLEEP - WIFI_CUT - E.t) : EMU_SLEEP - WIFI_CUT;
    const sa = !master && S.awake;
    const loop = F.wake === 'loop' && S.cycles >= 3;
    const top = Object.keys(S.tally).sort((a, b) => S.tally[b] - S.tally[a])[0];
    return {
      ba: cfg.emu === 'on' && master, ms: master, bt: S.awake,
      v: S.R.Vb.toFixed(1) + ' V', sa,
      sl: mmss(left), wo: mmss(wifi),
      an: S.awake, vs: loop ? 'SLEEP LOOP' : sa ? 'STUCK AWAKE' : S.awake ? 'AWAKE' : 'ASLEEP',
      cy: String(S.cycles), su: top || '—', ta: top ? S.tally[top] + '× ' + top : '—',
      nm: S.awake ? String(MODS.length) : '0'
    };
  }

  function reset(name, opts) {
    const T = {
      healthy:  { soc1: 0.8, soc4: 0.7, f: {} },
      flat:     { soc1: 0.0, soc4: 0.85, f: {} },
      weak:     { soc1: 0.04, soc4: 0.9, f: { bad: true } },
      deadalt:  { soc1: 0.8, soc4: 0.9, f: { alt: true } },
      noemu:    { soc1: 0.8, soc4: 0.9, f: {}, emu: 'none' },
      wontsleep:{ soc1: 0.8, soc4: 0.9, f: {}, wake: 'loop' }
    };
    const sc = opts && !name ? opts : Object.assign({}, T[name] || T.healthy, opts || {});
    F.bad = !!(sc.f && sc.f.bad); F.alt = !!(sc.f && sc.f.alt); F.revpol = false; F.wake = 'none';
    Object.keys(F.fuse).forEach(k => { F.fuse[k] = false; });
    Object.keys(L).forEach(k => { if (k !== 'blowPct') L[k] = (k === 'extra' ? 0 : false); });
    cfg.remote = true; cfg.emu = sc.emu || 'on';
    cfg.modMinV = 10.8; cfg.o.vStart = 14.0; cfg.o.limOut = 40; cfg.o.tStart = 10; cfg.o.tStop = 10; cfg.rw = 0.0008;
    seen = new Set();
    S = fresh(sc.soc1, sc.soc4);
    S.emu.st = cfg.emu === 'on' ? 'QUIET' : (cfg.emu === 'off' ? 'OFF' : 'NONE');
    if (sc.wake) { F.wake = sc.wake; }
    S.iso = !!sc.iso;
    S.initSoc1 = sc.soc1; S.initSoc4 = sc.soc4;
    if (sc.warm) {
      S.key = true; S.eng = true; S.awake = true; S.emu.seen = true; S.orion.st = 'CHARGING';
    }
    S.R = electrical();
    log('MODEL', sc.warm ? 'Simulation reset. Engine running, DC2DC charging.' : 'Simulation reset. Car asleep, key out, isolator open.');
    return S;
  }
  function setSoc(which, v) { if (which === 1) S.soc1 = v; else S.soc4 = v; }

  reset('healthy', { warm: true });

  return {
    get S() { return S; }, cfg, F, L, act, step, dash, reset, setSoc, ocv1, ocv4, soc1FromV,
    clockNow, clockAllowed, led, wifiOn, mods, stage, device, isMaster, MODS, SUSPECTS,
    note(src, msg) { log(src, msg); },
    consts: { ALT_V, ALT_MAX, EMU_SLEEP, WIFI_CUT, REV_A, REV_CHARGE_S, REV_SETTLE_S }
  };
})();
