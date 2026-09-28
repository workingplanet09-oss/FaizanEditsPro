import { BUDGET_RANGES } from "./site-defaults";

export const budgetLabel = (v: string | null | undefined) => (v ? BUDGET_RANGES.find((b) => b.value === v)?.label ?? v.replace(/_/g, " ") : "—");
