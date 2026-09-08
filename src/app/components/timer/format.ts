/** Format milliseconds as HH:MM:SS (e.g. 00:12:05). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/** Format minutes as a human-readable Chinese duration. */
export function formatMinutesHuman(minutes: number): string {
  const total = Math.round(minutes);
  if (total < 1) return '不足 1 分钟';
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours > 0 && mins > 0) return `${hours} 小时 ${mins} 分`;
  if (hours > 0) return `${hours} 小时`;
  return `${mins} 分钟`;
}
