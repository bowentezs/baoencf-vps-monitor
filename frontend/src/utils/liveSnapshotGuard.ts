export const LIVE_EMPTY_SNAPSHOT_GRACE_MS = 15_000;

type LiveSnapshotShape = {
  online: string[];
  clients: unknown[];
  count: number;
};

export function isEmptyLiveSnapshot(snapshot: LiveSnapshotShape): boolean {
  return snapshot.count === 0 && snapshot.online.length === 0 && snapshot.clients.length === 0;
}

export function shouldDeferLiveSnapshot(
  current: LiveSnapshotShape | null,
  next: LiveSnapshotShape,
): boolean {
  if (!current) return isEmptyLiveSnapshot(next);
  if (isEmptyLiveSnapshot(current)) return false;
  if (isEmptyLiveSnapshot(next)) return true;

  const currentOnlineCount = current.online.length;
  return currentOnlineCount >= 3 && next.online.length * 2 < currentOnlineCount;
}
