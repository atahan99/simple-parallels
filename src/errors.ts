import { ValidationError } from "./validate.js";

export function formatToolError(error: unknown): string {
  if (error instanceof ValidationError) {
    return error.message;
  }

  if (error instanceof PrlctlError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export class PrlctlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrlctlError";
  }
}

export function prlctlNotFoundMessage(path: string): string {
  return `prlctl not found at ${path}. Install Parallels Desktop CLI tools.`;
}

function snippet(text: string, maxLength = 500): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}…`;
}

export function mapPrlctlFailure(
  exitCode: number | null,
  stdout: string,
  stderr: string,
): never {
  const combined = `${stderr}\n${stdout}`;

  if (combined.includes("Failed to initialize Parallels Desktop")) {
    throw new PrlctlError("Parallels Desktop does not appear to be running.");
  }

  const parts: string[] = ["prlctl command failed."];
  const stderrText = stderr.trim();
  const stdoutText = stdout.trim();

  if (stderrText) {
    parts.push(`stderr: ${snippet(stderrText)}`);
  }
  if (stdoutText) {
    parts.push(`stdout: ${snippet(stdoutText)}`);
  }
  if (exitCode !== null) {
    parts.push(`exit code: ${exitCode}`);
  }

  throw new PrlctlError(parts.join("\n"));
}
