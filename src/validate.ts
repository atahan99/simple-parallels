const MAX_STRING_LENGTH = 256;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function assertValidIdentifier(
  value: string,
  label: string,
): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new ValidationError(`${label} cannot be empty.`);
  }

  if (trimmed.length > MAX_STRING_LENGTH) {
    throw new ValidationError(
      `${label} exceeds maximum length of ${MAX_STRING_LENGTH} characters.`,
    );
  }

  if (/[\0\n\r]/.test(trimmed)) {
    throw new ValidationError(
      `${label} contains invalid characters (null, newline, or carriage return).`,
    );
  }

  return trimmed;
}

export function assertValidVm(vm: string): string {
  return assertValidIdentifier(vm, "VM name");
}

export function assertValidSnapshotName(name: string): string {
  return assertValidIdentifier(name, "Snapshot name");
}

export function assertValidSnapshotId(id: string): string {
  return assertValidIdentifier(id, "Snapshot ID");
}

export function normalizeUuid(uuid: string): string {
  return uuid.replace(/[{}]/g, "").toLowerCase();
}
