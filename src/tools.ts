import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { formatToolError, prlctlNotFoundMessage } from "./errors.js";
import { openParallelsDesktopForUser } from "./parallels-app.js";
import { runVmLifecycleAction } from "./vm-lifecycle.js";
import {
  createSnapshot,
  deleteSnapshot,
  dropVmState,
  forceStopVm,
  listRunningVms,
  listSnapshots,
  listVms,
  PRLCTL_PATH,
  prlctlAvailable,
  revertToSnapshot,
  showVmInfo,
  vmAction,
  type VmRecord,
} from "./prlctl.js";
import {
  assertValidSnapshotId,
  assertValidSnapshotName,
  assertValidVm,
  normalizeUuid,
} from "./validate.js";

const vmSchema = z.object({
  vm: z.string().describe("VM display name or UUID"),
});

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function toolError(error: unknown) {
  return {
    content: [{ type: "text" as const, text: formatToolError(error) }],
    isError: true,
  };
}

function unavailableResult() {
  return toolError(prlctlNotFoundMessage(PRLCTL_PATH));
}

function formatVmTable(vms: VmRecord[], emptyMessage: string): string {
  if (vms.length === 0) {
    return emptyMessage;
  }

  const headers = ["Name", "Status", "UUID", "IP Configured"];
  const rows = vms.map((vm) => [
    vm.name,
    vm.status,
    vm.uuid,
    vm.ip_configured === undefined ? "" : String(vm.ip_configured),
  ]);

  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index].length)),
  );

  const formatRow = (cells: string[]) =>
    cells
      .map((cell, index) => cell.padEnd(widths[index] ?? cell.length))
      .join("  ");

  return [
    formatRow(headers),
    formatRow(widths.map((width) => "-".repeat(width))),
    ...rows.map(formatRow),
  ].join("\n");
}

function formatVmListResult(vms: VmRecord[], emptyMessage: string) {
  const table = formatVmTable(vms, emptyMessage);
  const json = JSON.stringify(vms, null, 2);
  return textResult(`${table}\n\nJSON:\n${json}`);
}

function findVm(
  vms: VmRecord[],
  query: string,
): { match?: VmRecord; multiple?: VmRecord[] } {
  const trimmed = assertValidVm(query);
  const normalizedQuery = normalizeUuid(trimmed);

  const byUuid = vms.filter(
    (vm) => normalizeUuid(vm.uuid) === normalizedQuery,
  );
  if (byUuid.length === 1) {
    return { match: byUuid[0] };
  }

  const byName = vms.filter((vm) => vm.name === trimmed);
  if (byName.length === 1) {
    return { match: byName[0] };
  }
  if (byName.length > 1) {
    return { multiple: byName };
  }

  return {};
}

function vmLookupError(
  vm: string,
  result: { match?: VmRecord; multiple?: VmRecord[] },
) {
  if (result.multiple) {
    const candidates = result.multiple
      .map((candidate) => `- ${candidate.name} (${candidate.uuid})`)
      .join("\n");
    return toolError(
      new Error(
        `Multiple VMs match name "${vm.trim()}". Use a UUID instead:\n${candidates}`,
      ),
    );
  }
  return toolError(new Error(`VM not found: "${vm.trim()}"`));
}

function actionSuccessMessage(action: string, vm: string, output: string) {
  return output
    ? `${action} succeeded for "${vm}".\n${output}`
    : `${action} succeeded for "${vm}".`;
}

function lifecycleSuccessMessage(
  action: string,
  vm: string,
  output: string,
  notes: string[],
) {
  const parts = [...notes, actionSuccessMessage(action, vm, output)];
  return parts.join("\n");
}

export function registerParallelsTools(server: McpServer): void {
  server.registerTool(
    "open_parallels_desktop",
    {
      title: "Open Parallels Desktop",
      description:
        "Launch the Parallels Desktop app on macOS. Use when prlctl reports Parallels is not running; wait a few seconds before other tools.",
    },
    async () => {
      try {
        const message = await openParallelsDesktopForUser();
        return textResult(message);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "list_vms",
    {
      title: "List VMs",
      description: "List all Parallels virtual machines with status and UUID.",
    },
    async () => {
      if (!prlctlAvailable) return unavailableResult();
      try {
        return formatVmListResult(
          await listVms(),
          "No virtual machines found.",
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "list_running_vms",
    {
      title: "List Running VMs",
      description:
        "List only running Parallels virtual machines with status and UUID.",
    },
    async () => {
      if (!prlctlAvailable) return unavailableResult();
      try {
        return formatVmListResult(
          await listRunningVms(),
          "No running virtual machines.",
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "show_vm_info",
    {
      title: "Show VM Info",
      description:
        "Get full Parallels VM configuration (large JSON). Use get_vm_status for a lightweight status check.",
      inputSchema: vmSchema,
    },
    async ({ vm }) => {
      if (!prlctlAvailable) return unavailableResult();
      try {
        const validVm = assertValidVm(vm);
        const output = await showVmInfo(validVm);
        return textResult(output || "{}");
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_vm_status",
    {
      title: "Get VM Status",
      description:
        "Get lightweight status for a VM by display name or UUID (with or without braces).",
      inputSchema: vmSchema,
    },
    async ({ vm }) => {
      if (!prlctlAvailable) return unavailableResult();
      try {
        const vms = await listVms();
        const result = findVm(vms, vm);
        if (result.multiple || !result.match) {
          return vmLookupError(vm, result);
        }
        return textResult(JSON.stringify(result.match, null, 2));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  const lifecycleDescription =
    "Ensures Parallels Desktop is running (opens in background if needed).";

  const lifecycleActions = [
    {
      name: "start_vm",
      action: "start" as const,
      title: "Start VM",
      description: `Start a Parallels virtual machine. ${lifecycleDescription}`,
    },
    {
      name: "restart_vm",
      action: "restart" as const,
      title: "Restart VM",
      description: `Restart a Parallels virtual machine. ${lifecycleDescription}`,
    },
    {
      name: "resume_vm",
      action: "resume" as const,
      title: "Resume VM",
      description: `Resume a suspended Parallels virtual machine. ${lifecycleDescription}`,
    },
  ];

  for (const { name, action, title, description } of lifecycleActions) {
    server.registerTool(
      name,
      { title, description, inputSchema: vmSchema },
      async ({ vm }) => {
        if (!prlctlAvailable) return unavailableResult();
        try {
          const validVm = assertValidVm(vm);
          const { output, notes } = await runVmLifecycleAction(action, validVm);
          return textResult(
            lifecycleSuccessMessage(action, validVm, output, notes),
          );
        } catch (error) {
          return toolError(error);
        }
      },
    );
  }

  const simpleActions = [
    {
      name: "stop_vm",
      action: "stop" as const,
      title: "Stop VM",
      description: "Gracefully stop a Parallels virtual machine.",
    },
    {
      name: "suspend_vm",
      action: "suspend" as const,
      title: "Suspend VM",
      description:
        "Suspend a VM to disk (saved state). Use pause_vm for in-memory pause.",
    },
    {
      name: "pause_vm",
      action: "pause" as const,
      title: "Pause VM",
      description:
        "Pause a running VM in memory. Use suspend_vm to save state to disk.",
    },
  ];

  for (const { name, action, title, description } of simpleActions) {
    server.registerTool(
      name,
      { title, description, inputSchema: vmSchema },
      async ({ vm }) => {
        if (!prlctlAvailable) return unavailableResult();
        try {
          const validVm = assertValidVm(vm);
          const output = await vmAction(action, validVm);
          return textResult(actionSuccessMessage(action, validVm, output));
        } catch (error) {
          return toolError(error);
        }
      },
    );
  }

  server.registerTool(
    "force_stop_vm",
    {
      title: "Force Stop VM",
      description: "Forcibly stop a Parallels virtual machine (prlctl stop --kill).",
      inputSchema: vmSchema,
    },
    async ({ vm }) => {
      if (!prlctlAvailable) return unavailableResult();
      try {
        const validVm = assertValidVm(vm);
        const output = await forceStopVm(validVm);
        return textResult(actionSuccessMessage("force stop", validVm, output));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "drop_vm_state",
    {
      title: "Drop VM State",
      description:
        "Drop the suspended state of a VM (prlctl stop --drop-state). Does not perform a normal shutdown.",
      inputSchema: vmSchema,
    },
    async ({ vm }) => {
      if (!prlctlAvailable) return unavailableResult();
      try {
        const validVm = assertValidVm(vm);
        const output = await dropVmState(validVm);
        return textResult(actionSuccessMessage("drop state", validVm, output));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "list_snapshots",
    {
      title: "List Snapshots",
      description:
        "List snapshots for a VM. Use returned IDs with revert_to_snapshot or delete_snapshot.",
      inputSchema: vmSchema,
    },
    async ({ vm }) => {
      if (!prlctlAvailable) return unavailableResult();
      try {
        const validVm = assertValidVm(vm);
        const output = await listSnapshots(validVm);
        return textResult(output || "[]");
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "create_snapshot",
    {
      title: "Create Snapshot",
      description: "Create a snapshot for a Parallels virtual machine.",
      inputSchema: z.object({
        vm: z.string().describe("VM display name or UUID"),
        name: z.string().describe("Snapshot name"),
        description: z
          .string()
          .optional()
          .describe("Optional snapshot description"),
      }),
    },
    async ({ vm, name, description }) => {
      if (!prlctlAvailable) return unavailableResult();
      try {
        const validVm = assertValidVm(vm);
        const validName = assertValidSnapshotName(name);
        const output = await createSnapshot(
          validVm,
          validName,
          description?.trim() || undefined,
        );
        return textResult(
          actionSuccessMessage(`create snapshot "${validName}"`, validVm, output),
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "revert_to_snapshot",
    {
      title: "Revert to Snapshot",
      description:
        "Revert a VM to a snapshot by ID. Run list_snapshots first to get the ID.",
      inputSchema: z.object({
        vm: z.string().describe("VM display name or UUID"),
        snapshot_id: z.string().describe("Snapshot ID from list_snapshots"),
        skip_resume: z
          .boolean()
          .optional()
          .describe(
            "If true, do not start the VM if it was running when the snapshot was taken",
          ),
      }),
    },
    async ({ vm, snapshot_id, skip_resume }) => {
      if (!prlctlAvailable) return unavailableResult();
      try {
        const validVm = assertValidVm(vm);
        const validId = assertValidSnapshotId(snapshot_id);
        const output = await revertToSnapshot(
          validVm,
          validId,
          skip_resume ?? false,
        );
        return textResult(
          actionSuccessMessage(`revert to snapshot ${validId}`, validVm, output),
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "delete_snapshot",
    {
      title: "Delete Snapshot",
      description:
        "Delete a VM snapshot by ID. Run list_snapshots first to get the ID.",
      inputSchema: z.object({
        vm: z.string().describe("VM display name or UUID"),
        snapshot_id: z.string().describe("Snapshot ID from list_snapshots"),
        include_children: z
          .boolean()
          .optional()
          .describe("If true, also delete child snapshots"),
      }),
    },
    async ({ vm, snapshot_id, include_children }) => {
      if (!prlctlAvailable) return unavailableResult();
      try {
        const validVm = assertValidVm(vm);
        const validId = assertValidSnapshotId(snapshot_id);
        const output = await deleteSnapshot(
          validVm,
          validId,
          include_children ?? false,
        );
        return textResult(
          actionSuccessMessage(`delete snapshot ${validId}`, validVm, output),
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
