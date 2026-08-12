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
  return isEmptyLiveSnapshot(next) && (!current || !isEmptyLiveSnapshot(current));
}
