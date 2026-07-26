// A short buzz on a mistake.
//
// Android and desktop Chrome expose the Vibration API. iOS never has — not in
// Safari, and not in Chrome or Firefox either, since every iOS browser is
// WebKit underneath. navigator.vibrate is simply undefined there.
//
// The one lever a web page has on iOS is the native switch control: since
// Safari 17.4, toggling an <input type="checkbox" switch> plays a haptic tap.
// So we keep one off-screen and click its label. It is a trick, it needs a real
// user gesture on the call stack (a mistake always comes from a tap, so that
// holds), and on iOS below 17.4 there is nothing we can do.

let label = null;
let iosSwitch;

function switchSupported() {
  if (iosSwitch === undefined) {
    iosSwitch = typeof HTMLInputElement !== 'undefined' && 'switch' in HTMLInputElement.prototype;
  }
  return iosSwitch;
}

function ensureSwitch() {
  if (label) return label;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.id = 'haptic-switch';
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');
  label = document.createElement('label');
  label.htmlFor = input.id;
  label.setAttribute('aria-hidden', 'true');
  const wrap = document.createElement('div');
  // Must stay rendered — display:none would take the haptic with it.
  wrap.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
  wrap.append(input, label);
  document.body.appendChild(wrap);
  return label;
}

/** True when this device can produce any feedback at all. */
export function hapticsAvailable() {
  return typeof navigator !== 'undefined' && (!!navigator.vibrate || switchSupported());
}

export function buzz(ms = 60) {
  try {
    if (navigator.vibrate) {
      navigator.vibrate(ms);
      return;
    }
    if (switchSupported()) ensureSwitch().click();
  } catch {
    /* feedback is a nicety — never let it break a move */
  }
}
