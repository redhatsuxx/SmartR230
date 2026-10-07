/* ===================================================================
   Guided demos for the DC2DC conversion. Each demo configures the
   model, then plays a short script in real seconds. A step can change
   playback speed, run an action, raise UI tokens and show a caption.
   =================================================================== */
const Demos = (function () {
  'use strict';
  const { cfg, F, L, act } = Core;
  const load = (o) => Object.assign(L, o);

  const list = [
    {
      id: 'drive', length: 30, title: 'Drive, charge and sleep',
      blurb: 'Start the engine, watch the DC2DC charger detect it and charge G1/4, then park and watch the SmartR230 LED.',
      setup() { Core.reset('healthy', { soc4: 0.5 }); },
      steps: [
        { at: 0, speed: 10, fn: () => act.keyIn(), say: 'Key in. The EIS wakes the CAN-B bus, the SmartR230 answers for the missing module, so the dash is clean. The LED flashes while the bus is awake.' },
        { at: 3, speed: 60, fn: () => act.start(), say: 'Engine started. The alternator lifts the bus above 14 V and the DC2DC charger begins its short start delay: about 10 seconds of a steady voltage above 14 V.' },
        { at: 6, say: 'Ten seconds of steady voltage: the DC2DC charger has detected the engine by voltage alone and charges the starter battery.' },
        { at: 8, speed: 300, say: 'Fast forward. G1/4 climbs through bulk and absorption while the alternator carries the loads.' },
        { at: 14, speed: 60, fn: () => { act.stop(); act.keyOut(); }, say: 'Engine off, key out. The bus stays awake for about 18 seconds.' },
        { at: 16, say: 'Voltage falls below 13.1 V, so after about 10 seconds the DC2DC charger stops charging. The bus has gone quiet: LED steady.' },
        { at: 18, speed: 300, say: 'Fast forward through the five-minute timer from the last master signal.' },
        { at: 22, say: 'Deep sleep: the SmartR230 LED goes out and its draw falls to a trickle.' }
      ]
    },
    {
      id: 'altdies', length: 30, title: 'Alternator dies while driving',
      blurb: 'The DC2DC charger locks out at once, so G1 cannot drag the starter battery down with it.',
      setup() { Core.reset('healthy', { soc4: 0.9, warm: true }); },
      steps: [
        { at: 0, speed: 60, fn: () => load({ head: true, blow: true }), say: 'Driving normally with headlights and the blower on. The DC2DC charger is charging G1/4.' },
        { at: 3, speed: 400, fn: () => act.fault('alt', true), say: 'The alternator fails. G1 now carries every load and the bus sags.' },
        { at: 5, say: 'The input falls below 12.5 V. The DC2DC charger locks out immediately, so G1/4 is left alone.' },
        { at: 10, say: 'G1 keeps draining under the load. There is no K57 here to merge the batteries.' },
        { at: 17, say: 'Below 9 V the control units drop out and the engine stalls.' },
        { at: 22, say: 'G1 is flat, but G1/4 is still nearly full. The isolator can borrow it, or the DC2DC charger can reverse-charge G1.' }
      ]
    },
    {
      id: 'isostart', length: 30, title: 'Low G1: isolator start',
      blurb: 'G1 is too weak to power the modules, so the EIS is dead. The isolator borrows G1/4, the car starts, then the alternator takes over.',
      setup() { Core.reset('weak'); },
      steps: [
        { at: 0, speed: 10, fn: () => act.keyIn(), say: 'Weak systems battery. Key in, but the bus would sag below 10.8 V under the module load, so the EIS and every other module has no power.' },
        { at: 3, fn: () => act.start(), say: 'Nothing wakes and the engine cannot start, even though the starter battery is perfectly good.' },
        { at: 6, fn: () => act.iso(true), say: 'Isolator closed: G1/4 now feeds the bus and powers the modules, the EIS included.' },
        { at: 9, say: 'The modules wake, the SmartR230 boots and the dash comes on.' },
        { at: 11, fn: () => act.start(), say: 'The engine starts on the starter battery.' },
        { at: 15, speed: 20, say: 'The alternator takes over and carries the bus.' },
        { at: 18, fn: () => act.iso(false), say: 'Isolator opened. The alternator carries everything and G1 recharges.' },
        { at: 24, speed: 120, say: 'The DC2DC charger detects the engine after about 10 seconds and tops up G1/4.' }
      ]
    },
    {
      id: 'flat', length: 30, title: 'Flat G1 rescue',
      blurb: 'Close the isolator (the 20 A link fuse blows), then use the DC2DC charger reverse charge from G1/4.',
      setup() { Core.reset('flat'); },
      steps: [
        { at: 0, speed: 10, fn: () => act.keyIn(), say: 'G1 is completely flat. Key in: the bus is far too low for the control units.' },
        { at: 2, fn: () => act.start(), say: 'Cranking is refused: the control units cannot run on this voltage.' },
        { at: 4, speed: 20, fn: () => act.iso(true), say: 'Isolator closed. G1/4 pours current into the flat battery through a 20 A fuse.' },
        { at: 7, say: 'The link fuse has blown. It protects the wiring, but the rescue stops.' },
        { at: 9, speed: 200, fn: () => { act.iso(false); act.keyOut(); act.reverse(); }, say: 'Key out to save power, then emergency reverse charge: the DC2DC charger pushes 25 A from G1/4 into G1 for 15 minutes.' },
        { at: 13.6, speed: 20, say: 'Reverse charge is done and the DC2DC charger settles for 5 minutes. G1 is no longer flat.' },
        { at: 15, speed: 10, fn: () => act.keyIn(), say: 'Key in again: the bus now holds enough voltage for the control units.' },
        { at: 17, fn: () => act.start(), say: 'The engine starts.' },
        { at: 21, speed: 120, say: 'The alternator recharges G1. The DC2DC charger starts charging G1/4 again once it holds 14 V for about 10 seconds.' }
      ]
    },
    {
      id: 'noemu', length: 30, title: 'No emulator, then fit it',
      blurb: 'Without the SmartR230 the car misses N82/1 and the dash warns of a battery fault.',
      setup() { Core.reset('noemu'); },
      steps: [
        { at: 0, speed: 10, fn: () => act.keyIn(), say: 'No SmartR230 fitted. Key in: nothing answers for N82/1 on CAN-B.' },
        { at: 3, say: 'The dash shows the battery fault and visit workshop message, and a missing-module fault is stored.' },
        { at: 6, fn: () => act.start(), say: 'The engine still starts. The DC2DC charger does not use CAN, so charging works anyway.' },
        { at: 11, speed: 60, say: 'But the dash warning stays on.' },
        { at: 14, fn: () => act.setEmu('on'), say: 'SmartR230 fitted. It boots and starts answering for N82/1.' },
        { at: 17, say: 'The dash message clears. The stored fault stays until a diagnostic tool clears it.' },
        { at: 21, fn: () => act.clearDtc(), say: 'Fault memory cleared with a diagnostic tool.' }
      ]
    },
    {
      id: 'clock', length: 30, title: 'Set the dash clock',
      blurb: 'The dash clock starts wrong. Use the SmartR230 clock page to fix it.',
      setup() { Core.reset('healthy', { warm: true }); },
      steps: [
        { at: 0, speed: 1, say: 'The dash clock is wrong. The SmartR230 can set it over its own Wi-Fi page.' },
        { at: 4, ui: ['clock:open'], say: 'Open the Clock Set page on the SmartR230.' },
        { at: 7, ui: ['clock:phone'], say: 'Use phone time fills in the day, hour and minute.' },
        { at: 10, ui: ['clock:submit'], say: 'Set clock. The page connects, sends, then holds for a few seconds.' },
        { at: 15, say: 'The dash clock jumps to the new time.' },
        { at: 20, say: 'The session finishes and the page reports the result.' }
      ]
    },
    {
      id: 'heavy', length: 30, title: 'Heavy load hides the engine',
      blurb: 'A big load keeps the bus under 14 V, so the DC2DC charger never sees the engine. Lower Vstart to fix it.',
      setup() { Core.reset('healthy', { soc4: 0.6 }); },
      steps: [
        { at: 0, speed: 10, fn: () => { act.keyIn(); load({ extra: 90 }); }, say: 'Key in with a very large extra load switched on.' },
        { at: 2, fn: () => act.start(), say: 'Engine started. The alternator is at its limit.' },
        { at: 4, speed: 60, say: 'With the alternator maxed out, the voltage at the DC2DC charger input stays just under 14 V.' },
        { at: 10, say: 'The DC2DC charger is still waiting: no engine detected, so G1/4 is not charging.' },
        { at: 12, fn: () => { cfg.o.vStart = 13.5; }, say: 'Vstart lowered to 13.5 V in the charger app.' },
        { at: 15, say: 'The DC2DC charger now sees enough voltage and starts its delay, then charges.' },
        { at: 21, fn: () => load({ extra: 0 }), say: 'Load removed. Charging carries on normally.' }
      ]
    },
    {
      id: 'wontsleep', length: 30, title: 'Car won’t sleep',
      blurb: 'A module keeps waking the bus. The SmartR230 analyser spots the pattern and names the suspect.',
      setup() { Core.reset('wontsleep'); },
      steps: [
        { at: 0, speed: 10, fn: () => act.keyIn(), say: 'A module is faulty and will keep waking the bus after the car is parked.' },
        { at: 2, fn: () => act.start(), say: 'Normal drive first.' },
        { at: 4, speed: 20, fn: () => { act.stop(); act.keyOut(); }, say: 'Parked. The bus sleeps after the grace period, then wakes again in bursts with no master signal.' },
        { at: 10, say: 'Each burst draws about 4 A. The analyser counts wake cycles and tallies the module responsible.' },
        { at: 14, say: 'Three cycles: the analyser reports a sleep loop and names the top suspect.' },
        { at: 18, fn: () => act.setWake('none'), speed: 300, say: 'Module repaired. The bus finally goes quiet and the five-minute timer runs.' },
        { at: 24, say: 'Deep sleep. Draw falls to the sleep trickle and the LED goes out.' }
      ]
    },
    {
      id: 'mistakes', length: 30, title: 'Install mistakes',
      blurb: 'Leave the LINK off and the DC2DC charger never charges. Connect it the wrong way round and it is destroyed.',
      setup() { Core.reset('healthy', { warm: true }); },
      steps: [
        { at: 0, speed: 60, say: 'A correct install: the DC2DC charger is charging G1/4.' },
        { at: 4, fn: () => act.link(false), say: 'The remote LINK jumper is left out. The DC2DC charger switches off and charges nothing.' },
        { at: 8, speed: 300, say: 'The starter battery slowly goes flat while the engine runs, and nothing warns you.' },
        { at: 14, fn: () => act.link(true), say: 'LINK fitted. After its start delay the DC2DC charger charges again.' },
        { at: 20, speed: 10, fn: () => act.fault('revpol', true), say: 'Battery leads connected the wrong way round. There is no reverse-polarity protection.' },
        { at: 23, say: 'The DC2DC charger is destroyed. No charging, and no reverse-charge rescue either.' }
      ]
    }
  ];

  let cur = null, t = 0, idx = 0;
  function start(id) {
    const d = list.find(x => x.id === id);
    if (!d) return null;
    d.setup();
    cur = d; t = 0; idx = 0;
    Core.note('DEMO', 'Demo started: ' + d.title + '.');
    return d;
  }
  function stop() { cur = null; }
  function active() { return cur; }

  function tick(dt) {
    if (!cur) return null;
    t += dt;
    let fired = false, speed = null, say = null, ui = [];
    while (idx < cur.steps.length && cur.steps[idx].at <= t) {
      const s = cur.steps[idx++];
      if (s.fn) { s.fn(); fired = true; }
      if (s.ui) ui = ui.concat(s.ui);
      if (s.speed) speed = s.speed;
      if (s.say) { say = s.say; Core.note('DEMO', s.say); }
    }
    if (t >= cur.length) {
      const id = cur.id; cur = null;
      Core.note('DEMO', 'Demo finished. Everything is still live, so you can keep playing.');
      return { done: true, fired, ui, speed: 60, say: 'Demo finished. Everything is still live, so you can keep playing.', progress: 1, id };
    }
    return { done: false, fired, ui, speed, say, progress: t / cur.length, id: cur.id };
  }
  return { list, start, stop, tick, active };
})();
