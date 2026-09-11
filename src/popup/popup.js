/*
 * nospopo — popup.
 *
 * To switch the filter OFF you must drag the handle to the right end and hold
 * it there for 1.5 seconds. The friction is the point: it stops an absent
 * minded click. To switch it ON, one click is enough.
 */
'use strict';

const HOLD_MS = 1500;
const END_THRESHOLD = 0.97;

const app = document.getElementById('app');
const panelOn = document.getElementById('panel-on');
const panelOff = document.getElementById('panel-off');
const track = document.getElementById('track');
const fill = document.getElementById('fill');
const handle = document.getElementById('handle');
const trackLabel = document.getElementById('trackLabel');
const turnOn = document.getElementById('turnOn');

let dragging = false;
let holdStart = 0;
let raf = 0;

function render(enabled) {
  document.body.classList.toggle('off', !enabled);
  panelOn.hidden = !enabled;
  panelOff.hidden = enabled;
  app.classList.remove('is-loading');
  if (enabled) reset();
}

async function setEnabled(enabled) {
  await chrome.storage.local.set({ enabled });
}

// --- the drag control -------------------------------------------------

function travel() {
  return track.clientWidth - handle.offsetWidth - 8;
}

function place(x) {
  const max = travel();
  const clamped = Math.max(0, Math.min(max, x));
  handle.style.left = (clamped + 4) + 'px';
  fill.style.width = (clamped + handle.offsetWidth + 4) + 'px';
  return max > 0 ? clamped / max : 0;
}

function reset() {
  dragging = false;
  holdStart = 0;
  cancelAnimationFrame(raf);
  handle.classList.add('snap');
  handle.classList.remove('holding');
  handle.style.removeProperty('--hold');
  place(0);
  trackLabel.textContent = 'slide to switch off';
  setTimeout(() => handle.classList.remove('snap'), 200);
}

function tick() {
  if (!holdStart) return;
  const progress = Math.min(1, (Date.now() - holdStart) / HOLD_MS);
  handle.style.setProperty('--hold', String(progress));
  const left = Math.ceil((HOLD_MS - (Date.now() - holdStart)) / 1000);
  trackLabel.textContent = 'hold… ' + Math.max(0, left);
  if (progress >= 1) {
    holdStart = 0;
    dragging = false;
    setEnabled(false);
    return;
  }
  raf = requestAnimationFrame(tick);
}

function onMove(event) {
  if (!dragging) return;
  const rect = track.getBoundingClientRect();
  const ratio = place(event.clientX - rect.left - handle.offsetWidth / 2);
  if (ratio >= END_THRESHOLD) {
    if (!holdStart) {
      holdStart = Date.now();
      handle.classList.add('holding');
      raf = requestAnimationFrame(tick);
    }
  } else if (holdStart) {
    // The user left the end zone. The hold starts again from zero.
    holdStart = 0;
    cancelAnimationFrame(raf);
    handle.classList.remove('holding');
    handle.style.removeProperty('--hold');
    trackLabel.textContent = 'slide to switch off';
  }
}

handle.addEventListener('pointerdown', (event) => {
  dragging = true;
  handle.classList.remove('snap');
  handle.setPointerCapture(event.pointerId);
});

handle.addEventListener('pointermove', onMove);
handle.addEventListener('pointerup', reset);
handle.addEventListener('pointercancel', reset);

// A click or a key press must do nothing. Only a pointer drag counts.
handle.addEventListener('click', (event) => event.preventDefault());
handle.addEventListener('keydown', (event) => event.preventDefault());

// --- the button -------------------------------------------------------

turnOn.addEventListener('click', () => setEnabled(true));

// --- state ------------------------------------------------------------

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.enabled) render(changes.enabled.newValue !== false);
});

chrome.storage.local.get({ enabled: true }, async (state) => {
  render(state.enabled !== false);
  if (state.enabled === false) {
    const alarm = await chrome.alarms.get('nospopo-restore');
    if (alarm) {
      const mins = Math.max(1, Math.round((alarm.scheduledTime - Date.now()) / 60000));
      document.getElementById('countdown').textContent =
        'It switches on again in ' + mins + ' minute' + (mins === 1 ? '' : 's') + '.';
    }
  }
});
