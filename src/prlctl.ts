import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mapPrlctlFailure,
  prlctlNotFoundMessage,
  PrlctlError,
} from "./errors.js";

const execFileAsync = promisify(execFile);

export const PRLCTL_PATH =
  process.env.PRLCTL_PATH ?? "/usr/local/bin/prlctl";

export let prlctlAvailable = false;

export interface VmRecord {
  uuid: string;
  name: string;
  status: string;
  ip_configured?: boolean | string;
}

export type VmPowerAction =
  | "start"
  | "stop"
  | "restart"
  | "suspend"
  | "resume"
  | "pause";

export async function initPrlctl(): Promise<void> {
  try {
    await access(PRLCTL_PATH, constants.X_OK);
    prlctlAvailable = true;
  } catch {
    prlctlAvailable = false;
  }
}

function assertPrlctlAvailable(): void {
  if (!prlctlAvailable) {
    throw new PrlctlError(prlctlNotFoundMessage(PRLCTL_PATH));
  }
}

async function runPrlctl(args: readonly string[]): Promise<string> {
  assertPrlctlAvailable();

  try {
    const { stdout } = await execFileAsync(PRLCTL_PATH, [...args], {
      maxBuffer: 10 * 1024 * 1024,
      encoding: "utf8",
    });
    return stdout.trim();
  } catch (error: unknown) {
    const execError = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number | string;
    };

    if (execError.code === "ENOENT") {
      prlctlAvailable = false;
      throw new PrlctlError(prlctlNotFoundMessage(PRLCTL_PATH));
    }

    mapPrlctlFailure(
      typeof execError.code === "number" ? execError.code : null,
      execError.stdout ?? "",
      execError.stderr ?? "",
    );
  }
}

function parseVmList(output: string): VmRecord[] {
  if (!output) {
    return [];
  }
  return JSON.parse(output) as VmRecord[];
}

export async function listVms(): Promise<VmRecord[]> {
  const output = await runPrlctl(["list", "--all", "-j"]);
  return parseVmList(output);
}

export async function listRunningVms(): Promise<VmRecord[]> {
  const output = await runPrlctl(["list", "-j"]);
  return parseVmList(output);
}

export async function showVmInfo(vm: string): Promise<string> {
  return runPrlctl(["list", "-i", "-j", vm]);
}

export async function vmAction(
  action: VmPowerAction,
  vm: string,
  flags: readonly string[] = [],
): Promise<string> {
  return runPrlctl([action, vm, ...flags]);
}

export async function forceStopVm(vm: string): Promise<string> {
  return runPrlctl(["stop", vm, "--kill"]);
}

export async function dropVmState(vm: string): Promise<string> {
  return runPrlctl(["stop", vm, "--drop-state"]);
}

export async function listSnapshots(vm: string): Promise<string> {
  return runPrlctl(["snapshot-list", vm, "-j"]);
}

export async function createSnapshot(
  vm: string,
  name: string,
  description?: string,
): Promise<string> {
  const args = ["snapshot", vm, "-n", name];
  if (description) {
    args.push("-d", description);
  }
  return runPrlctl(args);
}

export async function revertToSnapshot(
  vm: string,
  snapshotId: string,
  skipResume = false,
): Promise<string> {
  const args = ["snapshot-switch", vm, "--id", snapshotId];
  if (skipResume) {
    args.push("--skip-resume");
  }
  return runPrlctl(args);
}

export async function deleteSnapshot(
  vm: string,
  snapshotId: string,
  includeChildren = false,
): Promise<string> {
  const args = ["snapshot-delete", vm, "--id", snapshotId];
  if (includeChildren) {
    args.push("-c");
  }
  return runPrlctl(args);
}
