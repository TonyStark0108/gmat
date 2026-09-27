// The app's idea of "now". The time machine (development builds only) shifts it.

let offsetMs = 0;

export function now(): Date {
  return new Date(Date.now() + offsetMs);
}

export function setClockOffset(ms: number) {
  offsetMs = ms;
}

export function clockOffset() {
  return offsetMs;
}
