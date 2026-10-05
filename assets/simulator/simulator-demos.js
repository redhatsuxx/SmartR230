/* ===================================================================
   Guided demos. Each demo configures the model, then plays a short
   script in real seconds. A step can change the playback speed, run an
   action, and show a caption. Still no DOM access.
   =================================================================== */
const Demos = (function () {
  'use strict';
  const { cfg, F, L, act } = Core;

  function base() {
    cfg.thr = 10.8; cfg.prioMin = 12; cfg.sleepA = 0.04;
    L.blowPct = 100; L.extra = 0;
  }
  const load = (o) => Object.assign(L, o);

  const list = [
    {
      id: 'parked', length: 30, title: 'Parked for days, then a flat start',
      blurb: 'A parasitic draw empties a tired AGM. K57 and K75 close, then the timers run out.',
      setup() { cfg.sleepA = 0.25; Core.reset(null, { soc1: 0.45, soc4: 0.9, f: { bad: true } }); },
      steps: [
        { at: 0, speed: 21600, say: 'The car is parked and asleep. A 250 mA draw slowly empties a tired AGM, about 6 hours of sleep per second.' },
        { at: 8.5, speed: 10, fn: () => act.keyIn(), say: 'Two days later. Key in: N82/1 wakes up, reads T30 under the ignition load and finds it below the threshold. K57 and K75 close.' },
        { at: 10, speed: 60, fn: () => act.start(), say: 'Engine start on the starter battery, which is now backing up the system.' },
        { at: 11.5, fn: () => load({ blow: true, def: true, seat: true }), say: 'Blower, rear defroster and seat heaters switched on. Prioritisation cuts the defroster and heaters and caps the blower at 50%.' },
        { at: 14, speed: 120, say: 'Time now runs at 2 minutes per second while the alternator recharges G1.' },
        { at: 15.5, say: 'About 5 minutes of quick charge are done: K57 opens and the batteries separate. K75 and the load cuts stay on.' },
        { at: 18.5, say: 'Twelve minutes of healthy voltage: prioritisation ends and the consumers come back.' },
        { at: 25, say: 'Normal mode again. The fault memory still holds the entries until a diagnostic tool clears it.' }
      ]
    },
    {
      id: 'altdies', length: 30, title: 'Alternator dies while driving',
      blurb: 'No charge reaches either battery. G1 sags, K57 closes, then both batteries run flat.',
      setup() { Core.reset(null, { soc1: 0.55, soc4: 0.9, f: {} }); },
      steps: [
        { at: 0, speed: 10, fn: () => act.keyIn(), say: 'Healthy car. Key in, systems battery at about 12.4 V.' },
        { at: 2, speed: 60, fn: () => act.start(), say: 'Engine started. The alternator holds 14.1 V and the DC/DC converter tops up the starter battery.' },
        { at: 3.5, speed: 120, fn: () => load({ head: true, blow: true }), say: 'Headlights and blower on. The alternator carries the load and charges G1.' },
        { at: 7, speed: 400, fn: () => act.fault('alt', true), say: 'The alternator fails. G1 now carries every load and the DC/DC converter has nothing to work from.' },
        { at: 14, say: 'T30 sags under the threshold while driving. N82/1 closes K57 and K75 and the dash shows the consumer message.' },
        { at: 17, say: 'With K57 closed both batteries drain together. Nothing is charging either of them.' },
        { at: 20.5, speed: 60, say: 'Both batteries are flat. T30 falls under about 9 V, engine management drops out and the engine stalls.' },
        { at: 26, say: 'The fault memory now holds the undervoltage and emergency entries for the workshop.' }
      ]
    },
    {
      id: 'altfuse', length: 30, title: 'Alternator fuse F52f2 blows',
      blurb: 'A short circuit blows the 200 A fuse. Same result as a dead alternator, different repair.',
      setup() { Core.reset(null, { soc1: 0.55, soc4: 0.9, f: {} }); },
      steps: [
        { at: 0, speed: 10, fn: () => act.keyIn(), say: 'Healthy car. Key in.' },
        { at: 2, speed: 60, fn: () => act.start(), say: 'Engine running, alternator charging through F52f2.' },
        { at: 3.5, speed: 120, fn: () => load({ head: true, blow: true }), say: 'Headlights and blower on.' },
        { at: 7, speed: 400, fn: () => act.blowFuse(2), say: 'F52f2 blows. The alternator is still spinning but is cut off from the system, so G1 drains.' },
        { at: 14, say: 'T30 falls under the threshold. K57 and K75 close, same as a failed alternator.' },
        { at: 17, say: 'Both batteries drain together through K57. Nothing is charging them.' },
        { at: 20.5, speed: 60, say: 'Both batteries are flat and the engine stalls.' },
        { at: 26, say: 'A workshop would find the alternator healthy and the 200 A fuse open.' }
      ]
    },
    {
      id: 'burnt', length: 30, title: 'Burnt N82/1 board',
      blurb: 'The module is dead. The starter battery never gets topped up until it is replaced.',
      setup() { Core.reset(null, { soc1: 0.6, soc4: 0.5, f: { burnt: true } }); },
      steps: [
        { at: 0, speed: 60, fn: () => act.keyIn(), say: 'Burnt N82/1. Key in, but nothing answers on CAN-B and no relay can be commanded.' },
        { at: 3, fn: () => act.start(), say: 'The engine still starts on the batteries. The dash shows a workshop message.' },
        { at: 6, speed: 300, say: 'Running. The alternator charges G1, but the starter battery stays at 50% because the DC/DC converter is dead.' },
        { at: 16, fn: () => act.fault('burnt', false), say: 'A new module is fitted. N82/1 wakes up and the DC/DC converter starts charging the starter battery.' },
        { at: 24, say: 'The starter battery charge climbs again. The fault memory still needs clearing.' }
      ]
    },
    {
      id: 'f1', length: 30, title: 'Blown F52f1 with a weak battery',
      blurb: 'The starter battery is cut off from K57, so there is no emergency supply to fall back on.',
      setup() { Core.reset(null, { soc1: 0.06, soc4: 0.55, f: { f1: true, bad: true } }); },
      steps: [
        { at: 0, speed: 10, fn: () => act.keyIn(), say: 'F52f1 is blown and the AGM is nearly flat. N82/1 sees low voltage but K57 cannot reach the starter battery.' },
        { at: 2.5, speed: 60, fn: () => act.start(), say: 'The engine starts, but no emergency supply was available. The dash shows the red workshop message.' },
        { at: 8, speed: 240, say: 'Running. The alternator slowly recovers G1. The starter battery is not being charged at all.' },
        { at: 17, fn: () => act.blowFuse(1), say: 'F52f1 is replaced. The starter battery is back on N82/1 and the DC/DC converter resumes charging it.' },
        { at: 25, fn: () => act.clearDtc(), say: 'Fault memory cleared with a diagnostic tool.' }
      ]
    },
    {
      id: 'k57', length: 30, title: 'K57 stuck open',
      blurb: 'The cut-off relay is faulty, so the weak battery gets no help and the cluster says go to garage.',
      setup() { Core.reset(null, { soc1: 0.3, soc4: 0.9, f: { bad: true, k57: true } }); },
      steps: [
        { at: 0, speed: 10, fn: () => act.keyIn(), say: 'Weak AGM and a faulty K57. Key in: voltage is still just above the threshold.' },
        { at: 2.5, speed: 60, fn: () => act.start(), say: 'Cranking pulls T30 under the threshold. N82/1 wants K57 but cannot get an emergency supply.' },
        { at: 9, speed: 240, say: 'The engine runs and the alternator recovers G1, but the cluster keeps showing the garage message.' },
        { at: 18, fn: () => act.fault('k57', false), say: 'K57 is replaced. The garage message clears.' },
        { at: 22, fn: () => act.clearDtc(), say: 'Fault memory cleared with a diagnostic tool.' }
      ]
    }
  ];

  let cur = null, t = 0, idx = 0;

  function start(id) {
    const d = list.find(x => x.id === id);
    if (!d) return null;
    base(); d.setup();
    cur = d; t = 0; idx = 0;
    Core.note('DEMO', 'Demo started: ' + d.title + '.');
    return d;
  }
  function stop() { cur = null; }
  function active() { return cur; }

  function tick(dt) {
    if (!cur) return null;
    t += dt;
    let fired = false, speed = null, say = null;
    while (idx < cur.steps.length && cur.steps[idx].at <= t) {
      const s = cur.steps[idx++];
      if (s.fn) { s.fn(); fired = true; }
      if (s.speed) speed = s.speed;
      if (s.say) { say = s.say; Core.note('DEMO', s.say); }
    }
    if (t >= cur.length) {
      const id = cur.id; cur = null;
      Core.note('DEMO', 'Demo finished. Everything is still live, so you can keep playing.');
      return { done: true, fired, speed: 60, say: 'Demo finished. Everything is still live, so you can keep playing.', progress: 1, id };
    }
    return { done: false, fired, speed, say, progress: t / cur.length, id: cur.id };
  }

  return { list, start, stop, tick, active };
})();
