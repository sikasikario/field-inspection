import { describe, it, expect } from 'vitest';
import { applyTransition, STATUS, ROLE } from '../src/domain/inspectionStateMachine.js';

const inspector = { id: 1, role: ROLE.INSPECTOR };
const otherInspector = { id: 2, role: ROLE.INSPECTOR };
const coordinator = { id: 9, role: ROLE.COORDINATOR };
const inspection = (status) => ({ status, inspectorId: 1 });

const expectError = (fn, code) => {
  try {
    fn();
    throw new Error('trebuia să arunce eroare');
  } catch (err) {
    expect(err.code).toBe(code);
  }
};

describe('mașina de stări a inspecției', () => {
  it('fluxul complet: start → submit → approve', () => {
    expect(applyTransition({ action: 'start', inspection: inspection(STATUS.ASSIGNED), user: inspector })).toBe(STATUS.IN_PROGRESS);
    expect(applyTransition({ action: 'submit', inspection: inspection(STATUS.IN_PROGRESS), user: inspector, context: { missingRequiredItems: 0 } })).toBe(STATUS.SUBMITTED);
    expect(applyTransition({ action: 'approve', inspection: inspection(STATUS.SUBMITTED), user: coordinator })).toBe(STATUS.APPROVED);
  });

  it('respingere cu comentariu și redeschidere', () => {
    expect(applyTransition({ action: 'reject', inspection: inspection(STATUS.SUBMITTED), user: coordinator, context: { comment: 'Refă' } })).toBe(STATUS.REJECTED);
    expect(applyTransition({ action: 'reopen', inspection: inspection(STATUS.REJECTED), user: inspector })).toBe(STATUS.IN_PROGRESS);
  });

  it('nu permite tranziții din starea greșită', () => {
    expectError(() => applyTransition({ action: 'approve', inspection: inspection(STATUS.IN_PROGRESS), user: coordinator }), 'INVALID_TRANSITION');
    expectError(() => applyTransition({ action: 'submit', inspection: inspection(STATUS.APPROVED), user: inspector }), 'INVALID_TRANSITION');
  });

  it('o cerere repetată (submit de două ori) e respinsă a doua oară', () => {
    const insp = inspection(STATUS.IN_PROGRESS);
    insp.status = applyTransition({ action: 'submit', inspection: insp, user: inspector });
    expectError(() => applyTransition({ action: 'submit', inspection: insp, user: inspector }), 'INVALID_TRANSITION');
  });

  it('inspectorul nu poate aproba, coordonatorul nu poate trimite', () => {
    expectError(() => applyTransition({ action: 'approve', inspection: inspection(STATUS.SUBMITTED), user: inspector }), 'FORBIDDEN');
    expectError(() => applyTransition({ action: 'submit', inspection: inspection(STATUS.IN_PROGRESS), user: coordinator }), 'FORBIDDEN');
  });

  it('un inspector nu poate modifica inspecția altuia', () => {
    expectError(() => applyTransition({ action: 'start', inspection: inspection(STATUS.ASSIGNED), user: otherInspector }), 'FORBIDDEN');
  });

  it('submit cere toate răspunsurile obligatorii, reject cere comentariu', () => {
    expectError(() => applyTransition({ action: 'submit', inspection: inspection(STATUS.IN_PROGRESS), user: inspector, context: { missingRequiredItems: 2 } }), 'INCOMPLETE');
    expectError(() => applyTransition({ action: 'reject', inspection: inspection(STATUS.SUBMITTED), user: coordinator, context: { comment: '  ' } }), 'COMMENT_REQUIRED');
  });

  it('acțiune necunoscută', () => {
    expectError(() => applyTransition({ action: 'delete', inspection: inspection(STATUS.ASSIGNED), user: coordinator }), 'UNKNOWN_ACTION');
  });
});
