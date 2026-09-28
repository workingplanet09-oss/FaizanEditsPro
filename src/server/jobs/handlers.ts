import { deliverEmail } from "../email";
import { runAutomationAction } from "../events/actions";

export type JobHandler = (payload: any) => Promise<void>;

/** Registry of background job types. Add new async work here — nothing else needs to change. */
export const jobHandlers: Record<string, JobHandler> = {
  "email.send": async (p) => deliverEmail(p.emailLogId),
  "automation.action": async (p) => runAutomationAction(p),
  "asset.postprocess": async (p) => {
    const { postProcessAsset } = await import("../services/assets");
    await postProcessAsset(p.assetId);
  },
  "automation.emit": async (p) => {
    const { emit } = await import("../events/bus");
    await emit(p.name, p.payload);
  },
  "sweep.all": async () => {
    const { runSweeps } = await import("./sweeps");
    await runSweeps();
  },
};
