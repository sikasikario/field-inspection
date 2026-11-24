import { STATUS_LABELS } from '../lib/labels.js';

export function StatusBadge({ status, pending }) {
  return (
    <span className={`status status-${status.toLowerCase()}`}>
      {STATUS_LABELS[status] ?? status}
      {pending && ' (în așteptare)'}
    </span>
  );
}
