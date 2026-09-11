/*
 * nospopo — service worker.
 *
 * Holds the default state, the badge, and the 30-minute alarm that turns the
 * filter on again after you switched it off.
 */
'use strict';

const ALARM = 'nospopo-restore';
const RESTORE_MINUTES = 30;

async function setBadge(text, color) {
  await chrome.action.setBadgeText({ text });
  if (text) await chrome.action.setBadgeBackgroundColor({ color });
}

async function refreshBadge() {
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  if (enabled === false) await setBadge('OFF', '#c0392b');
  else await setBadge('', '#000000');
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get('enabled');
  if (typeof stored.enabled !== 'boolean') {
    await chrome.storage.local.set({ enabled: true });
  }
  await refreshBadge();
});

chrome.runtime.onStartup.addListener(refreshBadge);

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes.enabled) return;
  const enabled = changes.enabled.newValue !== false;
  await refreshBadge();
  if (enabled) {
    await chrome.alarms.clear(ALARM);
  } else {
    // A new "off" action resets the timer.
    await chrome.alarms.clear(ALARM);
    chrome.alarms.create(ALARM, { delayInMinutes: RESTORE_MINUTES });
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM) return;
  await chrome.storage.local.set({ enabled: true });
});

// The content script cannot touch chrome.action, so it reports through here.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'nospopo-health') {
    if (message.ok) refreshBadge();
    else setBadge('?', '#7f8c8d');
  }
  sendResponse({ received: true });
  return false;
});
