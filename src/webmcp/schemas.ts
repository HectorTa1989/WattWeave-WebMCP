/**
 * Explicit input schemas for every WebMCP tool. Zod validates at execution
 * time; the same schemas are exported as JSON Schema for registration and for
 * the developer inspector.
 */

import { z } from 'zod'

const hhmm = z
  .string()
  .regex(/^([01]?\d|2[0-3]):(00|15|30|45)$/, 'Expected HH:MM aligned to 15-minute slots')

export const emptySchema = z.object({}).strict()

export const loadStateSchema = z
  .object({
    windowStart: hhmm.describe('Start of the requested window, e.g. "14:00"'),
    windowEnd: hhmm.describe('End of the requested window (exclusive), e.g. "18:00"'),
  })
  .strict()

export const setConstraintSchema = z
  .object({
    assetId: z.string().min(1).describe('Must be the asset currently selected in the UI'),
    constraint: z.enum(['locked', 'maxPauseSlots', 'earliestStartSlot', 'maxSlotsEarlier']),
    value: z.union([z.boolean(), z.number().int()]),
  })
  .strict()

export const simulateSchema = z
  .object({
    objective: z
      .enum(['safe-peak', 'min-cost', 'balanced'])
      .default('safe-peak')
      .describe('Ranking preference for the deterministic heuristic'),
    maxCandidates: z.number().int().min(1).max(3).default(3),
    scenarioVersion: z
      .number()
      .int()
      .describe('Version from get_active_demand_event — rejected if stale'),
  })
  .strict()

export const previewSchema = z
  .object({
    candidateId: z.string().min(1),
    scenarioVersion: z.number().int(),
  })
  .strict()

export const stageSchema = z
  .object({
    candidateId: z.string().min(1),
    scenarioVersion: z.number().int(),
    idempotencyKey: z.string().min(1).describe('Replaying the same key returns the same stage'),
  })
  .strict()

export const stagedScheduleSchema = z
  .object({
    stageId: z.string().min(1),
  })
  .strict()

export const commitSchema = z
  .object({
    stageId: z.string().min(1),
    approvalToken: z
      .string()
      .min(1)
      .describe('Issued only when the operator clicks “Approve schedule”'),
    idempotencyKey: z.string().min(1),
  })
  .strict()

export const rollbackSchema = z
  .object({
    auditEventId: z.string().min(1).describe('The audit id returned by commit_load_plan'),
    idempotencyKey: z.string().min(1),
  })
  .strict()

export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>
}
