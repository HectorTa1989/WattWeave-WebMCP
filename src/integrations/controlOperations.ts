import { useStore, type Actor, type OpResult } from '../state/store'
import { controlMode, dispatchControlCommand, type ControlCommand, type ControlReceipt } from './controlGateway'

type CommitResult = {
  auditEventId: string
  committedVersion: number
  control: ControlReceipt
}

type RollbackResult = {
  restoredVersion: number
  control: ControlReceipt
}

const failure = (code: string, message: string): OpResult<never> => ({ ok: false, code, message })

export async function commitThroughControl(
  stageId: string,
  approvalToken: string,
  idempotencyKey: string,
  actor: Actor,
): Promise<OpResult<CommitResult>> {
  const state = useStore.getState()
  if (state.committed?.idempotencyKey === idempotencyKey) {
    return {
      ok: true,
      value: {
        auditEventId: state.committed.auditEventId,
        committedVersion: state.committed.version,
        control: {
          mode: controlMode(),
          accepted: controlMode() === 'live-gateway',
          operationId: null,
          message: 'Idempotent replay — no second control command was sent.',
        },
      },
    }
  }
  if (!state.staged) return failure('NOT_STAGED', 'Nothing is staged — stage_load_plan first.')
  if (state.staged.stageId !== stageId) return failure('UNKNOWN_STAGE', `Active stage is ${state.staged.stageId}.`)
  if (!state.staged.approvalToken) return failure('NOT_APPROVED', 'The operator has not approved this schedule.')
  if (approvalToken !== state.staged.approvalToken) return failure('BAD_TOKEN', 'Approval token mismatch.')
  if (state.staged.scenarioVersion !== state.scenarioVersion) {
    return failure('STALE_SCENARIO', 'Constraints changed after approval. Discard and re-plan.')
  }

  const command: ControlCommand = {
    operation: 'apply',
    idempotencyKey,
    scenario: { id: state.scenarioId, version: state.scenarioVersion },
    eventId: state.event.id,
    referenceId: stageId,
    slotMinutes: 15,
    actions: state.staged.actions,
  }
  const delivered = await dispatchControlCommand(command)
  if (!delivered.ok) return failure(delivered.code, delivered.message)

  // Re-read after the network boundary so store-level stale/token checks still
  // guard the final local transition.
  const committed = useStore.getState().commitPlan(stageId, approvalToken, idempotencyKey, actor)
  if (!committed.ok) return committed
  return { ok: true, value: { ...committed.value, control: delivered.receipt } }
}

export async function rollbackThroughControl(
  auditEventId: string,
  idempotencyKey: string,
  actor: Actor,
): Promise<OpResult<RollbackResult>> {
  const state = useStore.getState()
  const replayAuditId = state.rollbackKeys[idempotencyKey]
  if (replayAuditId) {
    return {
      ok: true,
      value: {
        restoredVersion: state.scenarioVersion,
        control: {
          mode: controlMode(),
          accepted: controlMode() === 'live-gateway',
          operationId: null,
          message: 'Idempotent replay — no second control command was sent.',
        },
      },
    }
  }
  if (!state.committed) return failure('NOT_COMMITTED', 'No committed plan is active.')
  if (state.committed.auditEventId !== auditEventId) {
    return failure('UNKNOWN_AUDIT', `Active commit audit id is ${state.committed.auditEventId}.`)
  }

  const command: ControlCommand = {
    operation: 'rollback',
    idempotencyKey,
    scenario: { id: state.scenarioId, version: state.scenarioVersion },
    eventId: state.event.id,
    referenceId: auditEventId,
    slotMinutes: 15,
    actions: state.committed.inverseActions,
  }
  const delivered = await dispatchControlCommand(command)
  if (!delivered.ok) return failure(delivered.code, delivered.message)
  const rolledBack = useStore.getState().rollbackPlan(auditEventId, idempotencyKey, actor)
  if (!rolledBack.ok) return rolledBack
  return { ok: true, value: { ...rolledBack.value, control: delivered.receipt } }
}
