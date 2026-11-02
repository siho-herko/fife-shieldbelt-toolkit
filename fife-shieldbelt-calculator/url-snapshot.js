/**
 * url-snapshot.js — compact problem + solution-map encoding for advisor share URLs.
 * Pure helpers (browser + Node) so share links carry diagnosis/context, not only codes.
 */

const SNAP_SYMPTOM_MAX = 80;
const SNAP_DIAG_MAX = 140;
const SNAP_MAP_MAX = 72;

export function truncText(value, max = 80) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function buildSolutionMapSnapshot(problem) {
  if (!problem) return null;
  return {
    a: truncText(problem.Solution_Agronomic, SNAP_MAP_MAX),
    i: truncText(problem.Solution_Infrastructure, SNAP_MAP_MAX),
    p: truncText(problem.Solution_Precision_Tech, SNAP_MAP_MAX),
    c: truncText(problem.Solution_Community, SNAP_MAP_MAX),
    e: truncText(problem.Solution_Emerging_Tech_Landscaping, SNAP_MAP_MAX),
  };
}

export function buildScenarioSnapshot(problem) {
  if (!problem) return null;
  return {
    code: problem.Problem_Code || '',
    cat: problem.Category || '',
    s: truncText(problem.Stated_Symptom, SNAP_SYMPTOM_MAX),
    d: truncText(problem.Farmer_Diagnosis_Copy, SNAP_DIAG_MAX),
    m: buildSolutionMapSnapshot(problem),
  };
}

function bytesToBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa === 'function'
    ? btoa(bin)
    : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(raw) {
  const padded = raw.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const b64 = padded + '='.repeat(padLen);
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/** Encode a problem into a compact URL-safe `snap` param. */
export function encodeSnapshotParam(problem) {
  const snap = buildScenarioSnapshot(problem);
  if (!snap) return null;
  const json = JSON.stringify(snap);
  const bytes = typeof TextEncoder === 'function'
    ? new TextEncoder().encode(json)
    : Buffer.from(json, 'utf8');
  return bytesToBase64Url(bytes);
}

/** Decode a `snap` param into a scenario snapshot object (or null). */
export function decodeSnapshotParam(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const bytes = base64UrlToBytes(raw);
    const json = typeof TextDecoder === 'function'
      ? new TextDecoder().decode(bytes)
      : Buffer.from(bytes).toString('utf8');
    const data = JSON.parse(json);
    if (!data || typeof data !== 'object') return null;
    return {
      code: String(data.code || ''),
      cat: String(data.cat || ''),
      s: String(data.s || ''),
      d: String(data.d || ''),
      m: data.m && typeof data.m === 'object'
        ? {
            a: String(data.m.a || ''),
            i: String(data.m.i || ''),
            p: String(data.m.p || ''),
            c: String(data.m.c || ''),
            e: String(data.m.e || ''),
          }
        : null,
    };
  } catch {
    return null;
  }
}

export const SOLUTION_MAP_LABELS = {
  a: 'Agronomic',
  i: 'Infrastructure',
  p: 'Precision Tech',
  c: 'Community',
  e: 'Emerging Tech',
};
