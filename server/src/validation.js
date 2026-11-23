// Funcții mici de validare pentru datele primite de la client.
import { badRequest } from './errors.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

export function requireUuid(value, field) {
  if (!isUuid(value)) throw badRequest(`${field} trebuie să fie un UUID valid`);
  return value;
}

export function requirePositiveInt(value, field) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw badRequest(`${field} trebuie să fie un întreg pozitiv`);
  return n;
}

export function optionalPositiveInt(value, field) {
  return value === undefined || value === '' ? undefined : requirePositiveInt(value, field);
}

export function optionalDate(value, field) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw badRequest(`${field} trebuie să fie o dată în formatul AAAA-LL-ZZ`);
  }
  return value;
}

export function optionalString(value, field, max = 2000) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.length > max) {
    throw badRequest(`${field} trebuie să fie text de maximum ${max} caractere`);
  }
  return value;
}

export function requireObject(value, field = 'corpul cererii') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw badRequest(`${field} lipsește sau e invalid`);
  return value;
}
