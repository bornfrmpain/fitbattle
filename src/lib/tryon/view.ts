import type { getJob } from "./repo";

export interface JobStepView { kind: "fashn" | "edit"; label: string; itemIds: string[] }
export interface JobSkipView { id: string; title: string; reason: string }

export function jobView(j: NonNullable<ReturnType<typeof getJob>>, viewerId: string | null) {
  const plan = JSON.parse(j.plan_json);
  return {
    id: j.id, seat: j.seat, status: j.status, step: j.step, totalSteps: j.total_steps, stepLabel: j.step_label, error: j.error,
    visibility: j.visibility, mine: j.user_id === viewerId, photoId: j.user_id === viewerId ? j.photo_id : null,
    itemIds: JSON.parse(j.item_ids_json), seed: j.seed, createdAt: j.created_at, updatedAt: j.updated_at,
    steps: plan.steps.map((s: { kind: JobStepView["kind"]; label: string; items: { id: string }[] }): JobStepView => ({ kind: s.kind, label: s.label, itemIds: s.items.map((i) => i.id) })) as JobStepView[],
    skipped: plan.skipped as JobSkipView[],
  };
}

export type JobView = ReturnType<typeof jobView>;
