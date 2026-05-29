# simple-parallels

MCP server for Parallels Desktop VM lifecycle. Exposes seven tools that call fixed `prlctl` commands via `execFile` (no shell, no arbitrary CLI).

**Requirements:** macOS, [Parallels Desktop](https://www.parallels.com/) running, `prlctl` (default `/usr/local/bin/prlctl`), Node.js 20+.

## Setup

```bash
npm install
npm run build
cp .cursor/mcp.json.example .cursor/mcp.json
```

Edit `.cursor/mcp.json` and replace `/path/to/simple-parallels` with your clone path. From the repo root:

```bash
# Clone root (paste into args, before /dist/index.js)
echo "$(pwd)/dist/index.js" | sed 's|/dist/index.js||'

# Or the full path to dist/index.js directly
echo "$(pwd)/dist/index.js"
```

```json
{
  "mcpServers": {
    "simple-parallels": {
      "command": "node",
      "args": ["/path/to/simple-parallels/dist/index.js"],
      "env": {
        "PRLCTL_PATH": "/usr/local/bin/prlctl"
      }
    }
  }
}
```

Reload **simple-parallels** in **Cursor Settings → MCP**, with Parallels Desktop open.

`.cursor/mcp.json` is gitignored; [`.cursor/mcp.json.example`](.cursor/mcp.json.example) matches the config above.

## Tools

| Tool | Input | Description |
|------|-------|-------------|
| `list_vms` | — | List all VMs |
| `get_vm_status` | `vm` | Status by name or UUID |
| `start_vm` | `vm` | Start a VM |
| `stop_vm` | `vm` | Stop a VM |
| `restart_vm` | `vm` | Restart a VM |
| `suspend_vm` | `vm` | Suspend a VM |
| `resume_vm` | `vm` | Resume a suspended VM |

`vm` accepts a display name (e.g. `Ubuntu 24.04 ARM64`) or UUID (with or without `{...}`). Run `list_vms` first for exact names.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PRLCTL_PATH` | `/usr/local/bin/prlctl` | Path to `prlctl` |

## Out of scope

Guest exec, snapshots, clone/delete, file transfer, arbitrary `prlctl` commands.
