// Limits how often something runs per key (e.g. one socket event stream per
// block): at most once every `ms`, running right away when it can and
// otherwise once more at the end with the latest call, so the last value is
// never dropped. `force` runs immediately (e.g. the final frame of a drag).
export function createKeyedThrottle(ms: number) {
  const last = new Map<string, number>();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  function run(key: string, fn: () => void) {
    clearTimeout(pending.get(key));
    pending.delete(key);
    last.set(key, Date.now());
    fn();
  }

  return function throttle(key: string, fn: () => void, force = false) {
    const wait = ms - (Date.now() - (last.get(key) ?? 0));
    if (force || wait <= 0) {
      run(key, fn);
      return;
    }
    clearTimeout(pending.get(key));
    pending.set(key, setTimeout(() => run(key, fn), wait));
  };
}
