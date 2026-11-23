// Mașina de stări a unei inspecții.
// Toate regulile despre „cine poate muta o inspecție din ce stare în ce stare” stau aici,
// într-un singur loc, în loc să fie împrăștiate prin rute.

export const STATUS = Object.freeze({
  ASSIGNED: 'ASSIGNED', // creată de coordonator, încă neîncepută
  IN_PROGRESS: 'IN_PROGRESS', // inspectorul completează (poate fi și offline)
  SUBMITTED: 'SUBMITTED', // trimisă spre verificare; inspectorul nu o mai poate edita
  APPROVED: 'APPROVED', // acceptată de coordonator (stare finală)
  REJECTED: 'REJECTED', // respinsă cu comentariu; inspectorul o poate redeschide
});

export const ROLE = Object.freeze({
  INSPECTOR: 'inspector',
  COORDINATOR: 'coordinator',
});

// acțiune -> { din ce stări e permisă, în ce stare duce, ce rol o poate face }
const TRANSITIONS = {
  start: { from: [STATUS.ASSIGNED], to: STATUS.IN_PROGRESS, role: ROLE.INSPECTOR },
  submit: { from: [STATUS.IN_PROGRESS], to: STATUS.SUBMITTED, role: ROLE.INSPECTOR },
  approve: { from: [STATUS.SUBMITTED], to: STATUS.APPROVED, role: ROLE.COORDINATOR },
  reject: { from: [STATUS.SUBMITTED], to: STATUS.REJECTED, role: ROLE.COORDINATOR },
  reopen: { from: [STATUS.REJECTED], to: STATUS.IN_PROGRESS, role: ROLE.INSPECTOR },
};

export const ACTIONS = Object.freeze(Object.keys(TRANSITIONS));

// Stările în care inspectorul are voie să modifice răspunsurile.
export const EDITABLE_STATUSES = Object.freeze([STATUS.ASSIGNED, STATUS.IN_PROGRESS]);

export class TransitionError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Verifică dacă o tranziție e permisă și întoarce starea nouă.
 * @param {object} p
 * @param {string} p.action - una din ACTIONS
 * @param {object} p.inspection - { status, inspectorId }
 * @param {object} p.user - { id, role }
 * @param {object} [p.context] - { comment, missingRequiredItems }
 */
export function applyTransition({ action, inspection, user, context = {} }) {
  const rule = TRANSITIONS[action];
  if (!rule) {
    throw new TransitionError('UNKNOWN_ACTION', `Acțiune necunoscută: ${action}`);
  }
  if (user.role !== rule.role) {
    throw new TransitionError('FORBIDDEN', `Rolul ${user.role} nu poate executa „${action}”`);
  }
  if (user.role === ROLE.INSPECTOR && inspection.inspectorId !== user.id) {
    throw new TransitionError('FORBIDDEN', 'Inspecția aparține altui inspector');
  }
  if (!rule.from.includes(inspection.status)) {
    throw new TransitionError(
      'INVALID_TRANSITION',
      `„${action}” nu e permisă din starea ${inspection.status}`,
    );
  }
  if (action === 'submit' && context.missingRequiredItems > 0) {
    throw new TransitionError(
      'INCOMPLETE',
      `Lipsesc ${context.missingRequiredItems} răspunsuri obligatorii`,
    );
  }
  if (action === 'reject' && !context.comment?.trim()) {
    throw new TransitionError('COMMENT_REQUIRED', 'Respingerea necesită un comentariu');
  }
  return rule.to;
}
