const WINDOW_MS = 15 * 60 * 1000;

export function buildMatchDatetime(matchDate: Date, matchTime: Date): Date {
  const dt = new Date(matchDate);
  dt.setUTCHours(matchTime.getUTCHours(), matchTime.getUTCMinutes(), matchTime.getUTCSeconds(), 0);
  return dt;
}

export function getMatchWindow(matchDate: Date, matchTime: Date) {
  const matchDatetime = buildMatchDatetime(matchDate, matchTime);
  const now = new Date();

  const opens_at = new Date(matchDatetime.getTime() - WINDOW_MS);
  const closes_at = new Date(matchDatetime.getTime() + WINDOW_MS);

  return {
    opens_at: opens_at.toISOString(),
    closes_at: closes_at.toISOString(),
    is_active: now >= opens_at && now <= closes_at,
  };
}

export function isMatchExpired(matchDate: Date, matchTime: Date): boolean {
  const closes_at = new Date(buildMatchDatetime(matchDate, matchTime).getTime() + WINDOW_MS);
  return new Date() > closes_at;
}
