const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

interface AttemptRecord {
  count: number;
  firstAttemptTime: number;
  lockedUntil?: number;
}

const attempts = new Map<string, AttemptRecord>();

function cleanupExpiredRecords() {
  const now = Date.now();
  for (const [key, record] of attempts.entries()) {
    if (now - record.firstAttemptTime > ATTEMPT_WINDOW_MS && !record.lockedUntil) {
      attempts.delete(key);
    } else if (record.lockedUntil && now > record.lockedUntil) {
      attempts.delete(key);
    }
  }
}

export function checkLoginAttempt(username: string): { allowed: boolean; error?: string } {
  cleanupExpiredRecords();

  const key = username.toLowerCase();
  const record = attempts.get(key);
  const now = Date.now();

  if (record?.lockedUntil && now < record.lockedUntil) {
    const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return {
      allowed: false,
      error: `Túl sok sikertelen bejelentkezési kísérlet. Próbálkozz újra ${remainingSeconds} másodperc után.`,
    };
  }

  return { allowed: true };
}

export function recordLoginAttempt(username: string, success: boolean) {
  cleanupExpiredRecords();

  const key = username.toLowerCase();
  const now = Date.now();

  if (success) {
    attempts.delete(key);
    return;
  }

  const record = attempts.get(key);

  if (!record) {
    attempts.set(key, {
      count: 1,
      firstAttemptTime: now,
    });
  } else if (now - record.firstAttemptTime > ATTEMPT_WINDOW_MS) {
    attempts.set(key, {
      count: 1,
      firstAttemptTime: now,
    });
  } else {
    record.count++;

    if (record.count >= MAX_ATTEMPTS) {
      record.lockedUntil = now + LOCKOUT_DURATION_MS;
    }
  }
}
