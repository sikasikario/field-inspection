// Sesiunea (token + utilizator) e păstrată în browser, ca aplicația să pornească și offline.
// Compromis documentat în ADR: un token în localStorage poate fi citit de un script injectat (XSS).
const KEY = 'fi.session';

export function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // stocare indisponibilă (ex. mod privat strict): sesiunea rămâne doar în memorie
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignorăm
  }
}
