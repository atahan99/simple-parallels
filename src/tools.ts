import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { formatToolError, prlctlNotFoundMessage } from "./errors.js";
import {
  listVms,
  PRLCTL_PATH,
  prlctlAvailable,
  vmAction,
  type VmRecord,
} from "./prlctl.js";
import { assertValidVm, normalizeUuid } from "./validate.js";

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

function formatVmTable(vms: VmRecord[]): string {
  if (vms.length === 0) {
    return "No virtual machines found.";
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

export function registerParallelsTools(server: McpServer): void {
  server.registerTool(
    "list_vms",
    {
      title: "List VMs",
      description: "List all Parallels virtual machines with status and UUID.",
    },
    async () => {
      if (!prlctlAvailable) {
        return unavailableResult();
      }

      try {
        const vms = await listVms();
        const table = formatVmTable(vms);
        const json = JSON.stringify(vms, null, 2);
        return textResult(`${table}\n\nJSON:\n${json}`);
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
        "Get status for a VM by display name or UUID (with or without braces).",
      inputSchema: vmSchema,
    },
    async ({ vm }) => {
      if (!prlctlAvailable) {
        return unavailableResult();
      }

      try {
        const vms = await listVms();
        const result = findVm(vms, vm);

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

        if (!result.match) {
          return toolError(new Error(`VM not found: "${vm.trim()}"`));
        }

        return textResult(JSON.stringify(result.match, null, 2));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  const actions = [
    {
      name: "start_vm",
      action: "start" as const,
      title: "Start VM",
      description: "Start a Parallels virtual machine.",
    },
    {
      name: "stop_vm",
      action: "stop" as const,
      title: "Stop VM",
      description: "Stop a Parallels virtual machine.",
    },
    {
      name: "restart_vm",
      action: "restart" as const,
      title: "Restart VM",
      description: "Restart a Parallels virtual machine.",
    },
    {
      name: "suspend_vm",
      action: "suspend" as const,
      title: "Suspend VM",
      description: "Suspend a Parallels virtual machine.",
    },
    {
      name: "resume_vm",
      action: "resume" as const,
      title: "Resume VM",
      description: "Resume a suspended Parallels virtual machine.",
    },
  ];

  for (const { name, action, title, description } of actions) {
    server.registerTool(
      name,
      {
        title,
        description,
        inputSchema: vmSchema,
      },
      async ({ vm }) => {
        if (!prlctlAvailable) {
          return unavailableResult();
        }

        try {
          const validVm = assertValidVm(vm);
          const output = await vmAction(action, validVm);
          const message = output
            ? `${action} succeeded for "${validVm}".\n${output}`
            : `${action} succeeded for "${validVm}".`;
          return textResult(message);
        } catch (error) {
          return toolError(error);
        }
      },
    );
  }
}
