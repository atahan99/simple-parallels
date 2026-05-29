const MAX_VM_LENGTH = 256;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function assertValidVm(vm: string): string {
  const trimmed = vm.trim();

  if (trimmed.length === 0) {
    throw new ValidationError("VM name cannot be empty.");
  }

  if (trimmed.length > MAX_VM_LENGTH) {
    throw new ValidationError(
      `VM name exceeds maximum length of ${MAX_VM_LENGTH} characters.`,
    );
  }

  if (/[\0\n\r]/.test(trimmed)) {
    throw new ValidationError(
      "VM name contains invalid characters (null, newline, or carriage return).",
    );
  }

  return trimmed;
}

export function normalizeUuid(uuid: string): string {
  return uuid.replace(/[{}]/g, "").toLowerCase();
}
