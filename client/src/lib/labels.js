export const STATUS_LABELS = {
  ASSIGNED: 'Asignată',
  IN_PROGRESS: 'În lucru',
  SUBMITTED: 'Trimisă',
  APPROVED: 'Aprobată',
  REJECTED: 'Respinsă',
};

export const EDITABLE = ['ASSIGNED', 'IN_PROGRESS'];

export const formatDate = (d) => (d ? new Date(d).toLocaleDateString('ro-RO') : '—');
export const formatDateTime = (d) => (d ? new Date(d).toLocaleString('ro-RO') : '—');
