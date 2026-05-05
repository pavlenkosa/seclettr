export interface ImportedGroupSenderKeyDistribution {
  groupId: string;
  senderDeviceId: string;
  distributionId: string;
}

type ImportedGroupSenderKeyDistributionListener = (
  distribution: ImportedGroupSenderKeyDistribution
) => void;

const senderKeyDistributionListeners =
  new Set<ImportedGroupSenderKeyDistributionListener>();

export function onSenderKeyDistributionImported(
  listener: ImportedGroupSenderKeyDistributionListener
): () => void {
  senderKeyDistributionListeners.add(listener);
  return () => {
    senderKeyDistributionListeners.delete(listener);
  };
}

export function notifySenderKeyDistributionImported(
  distribution: ImportedGroupSenderKeyDistribution
): void {
  for (const listener of senderKeyDistributionListeners) {
    listener(distribution);
  }
}
