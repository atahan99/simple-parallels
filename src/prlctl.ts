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

export async function listVms(): Promise<VmRecord[]> {
  const output = await runPrlctl(["list", "--all", "-j"]);
  if (!output) {
    return [];
  }

  return JSON.parse(output) as VmRecord[];
}

export async function vmAction(
  action: "start" | "stop" | "restart" | "suspend" | "resume",
  vm: string,
): Promise<string> {
  return runPrlctl([action, vm]);
}
