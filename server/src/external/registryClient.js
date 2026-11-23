// Clientul HTTP pentru registrul extern. Fiecare apel are timeout și o cheie de idempotență.
// Întoarce un rezultat clasificat: reușit, eșec temporar (se reîncearcă) sau eșec permanent.

function parseRetryAfter(header) {
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

export async function sendToRegistry({ registryUrl, idempotencyKey, payload, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${registryUrl}/registry/inspections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, registryId: data.registryId, replayed: data.replayed === true };
    }
    if (res.status === 429) {
      return { ok: false, retryable: true, error: 'HTTP 429 (rate limit)', retryAfterMs: parseRetryAfter(res.headers.get('retry-after')) };
    }
    if (res.status >= 500) return { ok: false, retryable: true, error: `HTTP ${res.status}` };
    // 4xx: cererea noastră e greșită; reîncercarea nu ar ajuta.
    return { ok: false, retryable: false, error: `HTTP ${res.status}` };
  } catch (err) {
    if (err.name === 'AbortError') return { ok: false, retryable: true, error: `timeout după ${timeoutMs} ms` };
    return { ok: false, retryable: true, error: `eroare de rețea: ${err.cause?.code ?? err.message}` };
  } finally {
    clearTimeout(timer);
  }
}
