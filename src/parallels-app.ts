import { execFile } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { PrlctlError } from "./errors.js";

const execFileAsync = promisify(execFile);

export const PARALLELS_APP_NAME =
  process.env.PARALLELS_APP_NAME ?? "Parallels Desktop";

const OPEN_PATH = process.env.OPEN_PATH ?? "/usr/bin/open";
const PGREP_PATH = process.env.PGREP_PATH ?? "/usr/bin/pgrep";

/** Main GUI process (not background --start-services launcher). */
const PRL_CLIENT_APP_PATTERN = "prl_client_app";

const INIT_WAIT_MS = parsePositiveInt(
  process.env.PARALLELS_INIT_WAIT_MS,
  3000,
);

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envFlagEnabled(
  value: string | undefined,
  defaultEnabled: boolean,
): boolean {
  if (value === undefined) {
    return defaultEnabled;
  }
  const normalized = value.trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  return defaultEnabled;
}

export function isAutoOpenEnabled(): boolean {
  return envFlagEnabled(process.env.PARALLELS_AUTO_OPEN_ON_VM_START, true);
}

function useBackgroundOpenForAutoEnsure(): boolean {
  return envFlagEnabled(process.env.PARALLELS_OPEN_IN_BACKGROUND, false);
}

/**
 * True when the Parallels Desktop GUI (prl_client_app) is running.
 * Background-only `prl_client_app --start-services` does not count.
 */
export async function isParallelsDesktopGuiRunning(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      PGREP_PATH,
      ["-fl", PRL_CLIENT_APP_PATTERN],
      { encoding: "utf8" },
    );

    const lines = stdout.trim().split("\n").filter(Boolean);
    return lines.some((line) => !line.includes("--start-services"));
  } catch (error: unknown) {
    const execError = error as NodeJS.ErrnoException;
    if (Number(execError.code) === 1) {
      return false;
    }
    if (execError.code === "ENOENT") {
      throw new PrlctlError(`Could not run ${PGREP_PATH}.`);
    }
    throw new PrlctlError(
      `Failed to detect Parallels Desktop GUI: ${execError.message}`,
    );
  }
}

export async function waitForParallelsInit(): Promise<void> {
  await delay(INIT_WAIT_MS);
}

export async function openParallelsDesktop(options?: {
  background?: boolean;
}): Promise<string> {
  const background =
    options?.background === undefined ? false : options.background;

  const args =
    background && useBackgroundOpenForAutoEnsure()
      ? ["-g", "-a", PARALLELS_APP_NAME]
      : ["-a", PARALLELS_APP_NAME];

  try {
    await execFileAsync(OPEN_PATH, args, { encoding: "utf8" });
    const mode = background ? "in the background" : "";
    return `Opened "${PARALLELS_APP_NAME}"${mode ? ` ${mode}` : ""}.`;
  } catch (error: unknown) {
    const execError = error as NodeJS.ErrnoException & {
      stderr?: string;
    };

    if (execError.code === "ENOENT") {
      throw new PrlctlError(`Could not run ${OPEN_PATH}.`);
    }

    const detail = execError.stderr?.trim() || execError.message;
    throw new PrlctlError(
      `Failed to open "${PARALLELS_APP_NAME}": ${detail}`,
    );
  }
}

export async function ensureParallelsDesktopGui(options?: {
  force?: boolean;
}): Promise<string | undefined> {
  const force = options?.force ?? false;
  const guiRunning = await isParallelsDesktopGuiRunning();

  if (!force && guiRunning) {
    return undefined;
  }

  const openMessage = await openParallelsDesktop({
    background: useBackgroundOpenForAutoEnsure(),
  });
  await waitForParallelsInit();
  return openMessage;
}

/** Foreground launch for the explicit MCP tool. */
export async function openParallelsDesktopForUser(): Promise<string> {
  const message = await openParallelsDesktop({ background: false });
  return `${message} Wait a few seconds, then use list_vms or other VM tools.`;
}
