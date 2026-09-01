// Call ring tone player (Web Audio API — no audio assets needed).
//
// startRing()/stopRing() play a looping "ring ring" tone for incoming and
// outgoing calls. Each ring is a short tone pulse followed by a pause, driven
// by the pattern: [toneSec, pauseSec, toneSec, longPauseSec].

let ctx = null;
let osc = null;
let gain = null;
let timer = null;
let level = 0.12;

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// Pattern alternates on/off segments; runs forever until stopRing().
function schedule(pattern, i) {
  const ac = ctx;
  if (!ac || !gain) return;
  const dur = pattern[i % pattern.length];
  const t0 = ac.currentTime;
  gain.gain.cancelScheduledValues(t0);
  if (i % 2 === 0) {
    // tone pulse (soft attack / decay to avoid clicks)
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(level, t0 + 0.03);
    gain.gain.setValueAtTime(level, t0 + Math.max(0, dur - 0.03));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  } else {
    gain.gain.setValueAtTime(0.0001, t0);
  }
  timer = setTimeout(() => schedule(pattern, i + 1), dur * 1000 + 40);
}

// options: { freq, pattern, level }
export function startRing({ freq = 440, pattern = [0.5, 0.3, 0.5, 1.3], volume } = {}) {
  stopRing();
  const ac = ensureCtx();
  if (!ac) return;
  if (volume != null) level = volume;
  osc = ac.createOscillator();
  gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.value = 0.0001;
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start();
  schedule(pattern, 0);
}

export function stopRing() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (gain && ctx) {
    try { gain.gain.cancelScheduledValues(ctx.currentTime); gain.gain.setValueAtTime(0.0001, ctx.currentTime); } catch (_) {}
  }
  if (osc) { try { osc.stop(); } catch (_) {} osc = null; }
  gain = null;
}