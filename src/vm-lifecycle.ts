import { isParallelsNotRunningError } from "./errors.js";
import {
  ensureParallelsDesktopGui,
  isAutoOpenEnabled,
} from "./parallels-app.js";
import { vmAction, type VmPowerAction } from "./prlctl.js";

export type VmLifecycleAction = Extract<
  VmPowerAction,
  "start" | "resume" | "restart"
>;

export async function runVmLifecycleAction(
  action: VmLifecycleAction,
  vm: string,
): Promise<{ output: string; notes: string[] }> {
  const notes: string[] = [];

  if (isAutoOpenEnabled()) {
    const ensureNote = await ensureParallelsDesktopGui();
    if (ensureNote) {
      notes.push(ensureNote);
    }
  }

  try {
    const output = await vmAction(action, vm);
    return { output, notes };
  } catch (error) {
    if (!isAutoOpenEnabled() || !isParallelsNotRunningError(error)) {
      throw error;
    }

    const retryNote = await ensureParallelsDesktopGui({ force: true });
    if (retryNote) {
      notes.push(`${retryNote} Retrying ${action}…`);
    }

    const output = await vmAction(action, vm);
    return { output, notes };
  }
}
