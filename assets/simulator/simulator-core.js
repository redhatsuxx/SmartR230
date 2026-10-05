/* ===================================================================
   N82/1 dual-battery model. No DOM access in this block, so it can be
   lifted into the smartr230.co.uk pages unchanged.
   Source tags: DOC = Mercedes-Benz training / WIS material,
                USER = value supplied by Glenn, MODEL = simulator assumption.
   =================================================================== */
const Core = (function () {
  'use strict';

  const ALT_V = 14.1;       // USER  alternator output voltage
  const ALT_MAX = 120;      // MODEL alternator capacity, amps
  const DCDC_MAX = 15;      // DOC   DC/DC converter limit, amps
  const K57_HOLD = 300;     // DOC   about 5 minutes
  const MON_WINDOW = 30;    // DOC   30 s wait for a start signal
  const SLEEP_DELAY = 30;   // MODEL time from key out to car asleep
  const CRANK_A = 180;      // MODEL starter current from G1/4
  const CRANK_MIN_V = 8.0;  // MODEL below this the starter will not turn
  const CRANK_LOAD = 25;    // MODEL extra amps on G1 while cranking (solenoid, injection, ignition)
  const ECU_MIN_V = 9.0;    // MODEL below this the control units brown out

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  // MODEL: open-circuit curves. AGM full at 12.85 V; lead-acid full at 12.65 V.
  const ocv1 = s => 11.7 + 1.15 * s - (s < 0.05 ? (0.05 - s) * 60 : 0);   // deep-discharge knee
  const ocv4 = s => 11.9 + 0.75 * s - (s < 0.05 ? (0.05 - s) * 60 : 0);
  const soc1FromV = v => clamp((v - 11.7) / 1.15, 0, 1);

  const cfg = { thr: 10.8, prioMin: 12, sleepA: 0.04, cap1: 70, cap4: 35 };
  const F = { burnt: false, bad: false, alt: false, f1: false, f2: false, k57: false };
  const L = { head: false, blow: false, def: false, seat: false, aud: false, blowPct: 100, extra: 0 };
  let S = null;
  let seen = new Set();

  function fresh(soc1, soc4) {
    return {
      t: 0, key: false, eng: false, canWake: 0, sleepT: 0, holdT: 0, awake: false,
      soc1, soc4, mod: 'STANDBY', monT: 0, emerg: false, prio: false,
      k57: false, k75: false, runT: 0, prioT: 0, holdK57: false,
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

  /* ---- electrical loads on terminal 30 (amps) ---- */
  function loads() {
    const out = { I: 0, blow: 0, def: false, seat: false, aud: 0, capped: false };
    if (!S.awake) { out.I = cfg.sleepA; return out; }
    if (!S.key && !S.eng) { out.I = 0.9; return out; }          // MODEL: CAN-B wake only
    out.I = (S.eng ? 22 : 14) + L.extra;                          // MODEL: ignition-on / running base, plus test load
    const p = S.prio && !F.burnt;
    if (L.head) out.I += 10;
    if (L.blow) {
      out.blow = p ? Math.min(L.blowPct, 50) : L.blowPct;        // DOC: blower limited to 50%
      out.capped = p && L.blowPct > 50;
      out.I += 30 * out.blow / 100;
    }
    if (L.def && !p) { out.def = true; out.I += 25; }             // DOC: defroster off in emergency op
    if (L.seat && !p) { out.seat = true; out.I += 18; }           // DOC: seat heaters off
    if (L.aud) { out.aud = p ? 1 : 2; out.I += p ? 2 : 4; }       // DOC: radio volume limited
    return out;
  }

  /* ---- solve the two batteries, alternator and relays for this instant ---- */
  function electrical() {
    const capEff1 = cfg.cap1 * (F.bad ? 0.45 : 1);                // MODEL
    const R1 = (0.006 + (1 - S.soc1) * 0.006) * (F.bad ? 6 : 1);  // MODEL
    const R4 = 0.01 + (1 - S.soc4) * 0.02;                        // MODEL
    const E1 = ocv1(S.soc1), E4 = ocv4(S.soc4);
    const ld = loads();
    const modOK = !F.burnt;
    const altOK = S.eng && !F.alt && !F.f2;
    const link = S.k57 && modOK && !F.f1 && !F.k57;
    const acc1 = capEff1 * 0.8 * (1 - S.soc1) + 0.7;              // MODEL: charge acceptance
    const acc4 = cfg.cap4 * 0.6 * (1 - S.soc4) + 1.0;
    const dcdc = altOK && modOK && !F.f1 && !link && S.soc4 < 0.98;
    let I1, I4 = 0, Ialt = 0, V30, V4;

    if (altOK) {
      const c1 = Math.min(acc1, Math.max(0, (ALT_V - E1) / R1));
      const c4 = link ? Math.min(acc4, Math.max(0, (ALT_V - E4) / R4)) : (dcdc ? Math.min(DCDC_MAX, acc4) : 0);
      const room = Math.max(0, ALT_MAX - ld.I);
      const k = (c1 + c4) > room && (c1 + c4) > 0 ? room / (c1 + c4) : 1;
      I1 = c1 * k; I4 = c4 * k; Ialt = ld.I + I1 + I4;
      V30 = ALT_V - 0.003 * Ialt;
      V4 = link ? V30 : E4 + I4 * R4;
    } else if (link) {
      const V = (E1 / R1 + E4 / R4 - ld.I) / (1 / R1 + 1 / R4);
      I1 = (V - E1) / R1; I4 = (V - E4) / R4; V30 = V; V4 = V;
    } else {
      I1 = -ld.I; V30 = E1 + I1 * R1;
      I4 = -(S.awake && modOK ? 0.01 : 0.003); V4 = E4;
    }
    return { V30, V4, I1, I4, Ialt, ld, link, dcdc, R1, R4, E1, E4, capEff1, altOK };
  }

  /* ---- emergency operation ---- */
  function tryEmergency(why) {
    if (S.emerg) return;
    if (F.k57) {                                                  // DOC: K57 faulty -> GO TO GARAGE
      logOnce('k57f', 'DOC', 'Undervoltage at T30 but K57 is faulty: no emergency supply is possible.');
      addDtc('K57', 'Battery cut-off relay K57 fault');
      return;
    }
    if (F.f1) {
      logOnce('f1f', 'MODEL', 'Undervoltage at T30 but F52f1 is open: K57 cannot reach the starter battery.');
      addDtc('F1', 'Supply to K57 / K75 / N82/1 interrupted (F52f1)');
      return;
    }
    S.emerg = true; S.k57 = true; S.k75 = true; S.prio = true; S.runT = 0; S.prioT = 0;
    S.mod = S.eng ? 'LIMP-HOME' : 'EMERGENCY START';
    log('DOC', 'T30 below ' + cfg.thr.toFixed(1) + ' V (' + why + '). N82/1 closes K57 and K75, sends the limp-home message on CAN-B and stores a fault.');
    addDtc('UV', 'Systems battery undervoltage (T30)');
    addDtc('EM', 'Emergency operation was active');
  }

  function releaseEmergency(why) {
    S.k57 = false; S.k75 = false; S.prio = false; S.emerg = false; S.holdK57 = false;
    seen.delete('k57f'); seen.delete('f1f');
    log('DOC', why);
  }

  /* ---- one simulation step ---- */
  function step(dt) {
    S.t += dt;
    if (S.canWake > 0) S.canWake = Math.max(0, S.canWake - dt);
    if (S.sleepT > 0) S.sleepT = Math.max(0, S.sleepT - dt);
    const wasAwake = S.awake;
    S.awake = S.key || S.eng || S.canWake > 0 || S.sleepT > 0 || S.holdT > 0;
    if (wasAwake && !S.awake) log('MODEL', 'Control units go to sleep. The parasitic draw is now the only load on G1.');

    const el = electrical();

    if (F.burnt) {
      if (S.mod !== 'NO RESPONSE') {
        S.mod = 'NO RESPONSE';
        S.k57 = false; S.k75 = false; S.prio = false; S.emerg = false;
        log('MODEL', 'N82/1 is dead: no relay control, no DC/DC charging, no CAN-B messages.');
      }
    } else {
      if (S.mod === 'NO RESPONSE') S.mod = 'STANDBY';
      const v = el.V30;
      switch (S.mod) {
        case 'MONITORING':
          S.monT -= dt;
          if (v < cfg.thr) tryEmergency('wake-up check');
          else if (S.eng) S.mod = 'NORMAL MODE';
          else if (S.monT <= 0) {
            S.mod = 'STANDBY';
            log('DOC', 'No start signal within 30 s, so N82/1 returns to standby. Remove the key and insert it again to wake it.');
          }
          break;
        case 'NORMAL MODE':
          if (!S.eng) { startSwitchOff(); break; }
          if (v < cfg.thr) tryEmergency('while running');      // MODEL: in-drive trigger, documents describe start-up
          break;
        case 'EMERGENCY START':
          S.monT -= dt;
          if (S.eng) { S.mod = 'LIMP-HOME'; log('DOC', 'Engine running. The alternator now feeds both batteries through K57.'); }
          else if (S.monT <= 0) { S.mod = 'STANDBY'; releaseEmergency('No start signal within 30 s. K57 and K75 released, N82/1 back to standby.'); }
          break;
        case 'LIMP-HOME':
          if (!S.eng) { startSwitchOff(); break; }
          S.runT += dt;
          if (v >= cfg.thr && el.altOK) S.prioT += dt; else S.prioT = 0;   // MODEL: only charging time counts; window restarts if T30 sags
          if (S.k57 && S.runT >= K57_HOLD && v >= cfg.thr + 0.5 && el.altOK) {   // MODEL: needs a charging alternator; 0.5 V hysteresis stops chatter
            S.k57 = false; log('DOC', 'About 5 minutes of quick charge done. K57 opens and G1/4 is separated again.');
          } else if (!S.k57 && v < cfg.thr) {
            if (!F.k57 && !F.f1) { S.k57 = true; log('MODEL', 'T30 sagged again. K57 closes once more.'); }
          }
          if (S.prioT >= cfg.prioMin * 60) {
            S.mod = 'NORMAL MODE';
            releaseEmergency('Prioritisation ends after ' + cfg.prioMin + ' min of running with healthy voltage. Consumers are released.');
          }
          break;
        case 'SWITCH-OFF PHASE':
          S.holdT -= dt;
          if (S.holdT <= 0) {
            S.holdT = 0;
            if (S.emerg) releaseEmergency('K57 hold time over. G1/4 is separated from G1.');
            S.mod = 'STANDBY';
          }
          break;
        default: break;
      }
    }

    if (S.eng && el.V30 < ECU_MIN_V) {
      S.eng = false;
      log('MODEL', 'Voltage at T30 fell below ' + ECU_MIN_V.toFixed(1) + ' V. Engine management drops out and the engine stalls.');
    }

    // integrate charge (charging efficiency 95%)
    const eff = q => (q > 0 ? q * 0.95 : q);
    S.soc1 = clamp(S.soc1 + eff(el.I1 * dt) / (el.capEff1 * 3600), 0, 1);
    S.soc4 = clamp(S.soc4 + eff(el.I4 * dt) / (cfg.cap4 * 3600), 0, 1);
    S.R = el;
  }

  function startSwitchOff() {
    S.mod = 'SWITCH-OFF PHASE';
    if (S.emerg) {
      S.holdT = K57_HOLD; S.holdK57 = true;
      log('DOC', 'Engine off after emergency operation: K57 stays energised for about 5 minutes.');
    } else {
      S.holdT = 6;                                                // MODEL: short display phase
      log('DOC', 'Engine off: G1/4 stays separated from G1.');
    }
  }

  /* ---- operator actions ---- */
  const act = {
    keyIn() {
      if (S.key) return;
      S.key = true; S.sleepT = 0; seen.clear();
      log('USER', 'Key inserted. The EIS microswitch wakes N82/1.');
      if (!F.burnt) { S.mod = 'MONITORING'; S.monT = MON_WINDOW; }
    },
    keyOut() {
      if (!S.key) return;
      S.key = false;
      if (S.eng) { S.eng = false; log('USER', 'Key removed with the engine running: engine stops.'); }
      else log('USER', 'Key removed.');
      if (!S.eng && !S.holdT && S.mod !== 'SWITCH-OFF PHASE' && S.mod !== 'EMERGENCY START' && !F.burnt) { S.mod = 'STANDBY'; }
      S.sleepT = SLEEP_DELAY;
    },
    canWake() {
      if (S.awake && S.mod !== 'STANDBY') return;
      S.canWake = MON_WINDOW; S.sleepT = 0;
      log('USER', 'A CAN-B message wakes the car and N82/1.');
      if (!F.burnt) { S.mod = 'MONITORING'; S.monT = MON_WINDOW; }
    },
    start() {
      if (!S.key || S.eng) return;
      S.R = electrical();
      const el = S.R;
      if (el.V30 < ECU_MIN_V && !el.link) {
        log('MODEL', 'Voltage at T30 is only ' + el.V30.toFixed(1) + ' V. The control units cannot run, so the engine will not start.');
        return;
      }
      const Vc = el.E4 - CRANK_A * (el.link ? el.R4 * 0.7 : el.R4);
      S.lastCrank = Vc;
      if (Vc < CRANK_MIN_V) {
        log('MODEL', 'Starter battery dips to ' + Vc.toFixed(1) + ' V under cranking. The starter will not turn.');
        addDtc('G4', 'Starter battery voltage too low');
        return;
      }
      S.soc4 = clamp(S.soc4 - (CRANK_A * 2) / (cfg.cap4 * 3600), 0, 1);
      S.eng = true; S.sleepT = 0;
      log('USER', 'Engine started. Starter battery dipped to ' + Vc.toFixed(1) + ' V. Terminal 61 is on.');
      if (!F.burnt) {
        if (S.mod === 'STANDBY' || S.mod === 'MONITORING') S.mod = 'NORMAL MODE';
        if (S.emerg) S.mod = 'LIMP-HOME';
      }
      // MODEL: G1 sags under the extra cranking load. If T30 dips below the threshold, N82/1 closes K57 and K75.
      const V30c = el.link ? el.V30 : el.E1 - (el.ld.I + CRANK_LOAD) * el.R1;
      S.lastCrank30 = V30c;
      if (!F.burnt && !S.emerg && V30c < cfg.thr) tryEmergency('T30 dipped to ' + V30c.toFixed(1) + ' V as the engine started');
    },
    stop() {
      if (!S.eng) return;
      S.eng = false;
      log('USER', 'Engine stopped. Terminal 61 is off.');
      if (!F.burnt && (S.mod === 'NORMAL MODE' || S.mod === 'LIMP-HOME')) startSwitchOff();
    },
    clearDtc() { S.dtc = []; log('USER', 'Fault memory cleared with a diagnostic tool.'); },
    blowFuse(which) {
      const k = which === 1 ? 'f1' : 'f2';
      F[k] = !F[k];
      log('USER', 'Fuse ' + (which === 1 ? 'F52f1 (100 A)' : 'F52f2 (200 A)') + (F[k] ? ' blown.' : ' replaced.'));
      if (F[k]) addDtc(which === 1 ? 'F1' : 'F2', which === 1 ? 'Supply to K57 / K75 / N82/1 interrupted (F52f1)' : 'Alternator circuit interrupted (F52f2)');
    },
    fault(name, on) {
      if (F[name] === on) return;
      F[name] = on;
      const lab = { burnt: 'N82/1 burnt board', bad: 'Weak systems battery', alt: 'Alternator failure', f1: 'F52f1 blown', f2: 'F52f2 blown', k57: 'K57 stuck open' }[name];
      log('USER', lab + (on ? ' injected.' : ' removed.'));
      if (on && name === 'f1') addDtc('F1', 'Supply to K57 / K75 / N82/1 interrupted (F52f1)');
      if (on && name === 'f2') addDtc('F2', 'Alternator circuit interrupted (F52f2)');
      if (on && name === 'k57') addDtc('K57', 'Battery cut-off relay K57 fault');
      if (on && name === 'alt') addDtc('G2', 'Alternator output missing');
      seen.clear();
    }
  };

  /* ---- cluster message ---- */
  function dash() {
    const on = S.awake && (S.key || S.eng) && S.R && S.R.V30 > 6;
    if (!on) return { off: true, cat: 0, msg: '', sub: '' };
    if (F.k57) return { cat: 1, msg: 'GO TO GARAGE', sub: 'K57 faulty: no emergency supply' };                  // DOC message
    if (F.burnt) return { cat: 1, msg: 'Visit workshop!', sub: 'N82/1 not answering on CAN-B' };              // MODEL trigger
    if (F.f1 || ocv4(S.soc4) < 11.9) return { cat: 1, msg: 'Visit workshop!', sub: 'Starter battery failure (G1/4)' }; // DOC message, MODEL trigger
    if (S.emerg || S.prio) return { cat: 2, msg: 'Electric consumers offline!', sub: 'Systems battery low' };  // DOC
    return { cat: 0, msg: 'No messages', sub: '' };
  }

  function reset(name, opts) {
    const sc = opts || {
      healthy: { soc1: 0.8, soc4: 0.9, f: {} },
      weak:    { soc1: 0.30, soc4: 0.9, f: { bad: true } },
      alt:     { soc1: 0.43, soc4: 0.9, f: { alt: true } },
      burnt:   { soc1: 0.43, soc4: 0.9, f: { burnt: true } },
      f52f1:   { soc1: 0.06, soc4: 0.9, f: { f1: true, bad: true } }
    }[name];
    let soc1, soc4;
    if (sc) {
      Object.keys(F).forEach(k => { F[k] = !!sc.f[k]; });
      Object.keys(L).forEach(k => { if (k !== 'blowPct') L[k] = (k === 'extra' ? 0 : false); });
      soc1 = sc.soc1; soc4 = sc.soc4;
    } else {
      soc1 = S ? S.initSoc1 : 0.43; soc4 = S ? S.initSoc4 : 0.9;
    }
    seen = new Set();
    S = fresh(soc1, soc4);
    S.initSoc1 = soc1; S.initSoc4 = soc4;
    S.R = electrical();
    log('MODEL', 'Simulation reset. Car asleep, key out, K57 open.');
  }

  function setSoc(which, v) {
    if (which === 1) S.soc1 = v; else S.soc4 = v;
  }

  S = fresh(soc1FromV(12.2), 0.9);
  S.initSoc1 = S.soc1; S.initSoc4 = S.soc4;
  log('USER', 'Starting state: car asleep, systems battery resting at about 12.2 V.');
  S.R = electrical();

  return {
    get S() { return S; }, cfg, F, L, act, step, dash, reset, setSoc, ocv1, ocv4, soc1FromV,
    note(src, msg) { log(src, msg); },
    consts: { ALT_V, ALT_MAX, DCDC_MAX, K57_HOLD }
  };
})();
