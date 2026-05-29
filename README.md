# simple-parallels

MCP server for Parallels Desktop VM lifecycle and snapshots. Seventeen tools use fixed `execFile` commands (no shell, no arbitrary CLI).

**Requirements:** macOS, [Parallels Desktop](https://www.parallels.com/) installed, `prlctl` (default `/usr/local/bin/prlctl`), Node.js 20+. `start_vm`, `resume_vm`, and `restart_vm` open Parallels in the background if it is not running.

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

Reload **simple-parallels** in **Cursor Settings → MCP**.

`.cursor/mcp.json` is gitignored; [`.cursor/mcp.json.example`](.cursor/mcp.json.example) matches the config above.

## Tools

| Tool | Input | Description |
|------|-------|-------------|
| `open_parallels_desktop` | — | Launch Parallels Desktop (foreground) |
| `list_vms` | — | List all VMs |
| `list_running_vms` | — | List running VMs only |
| `show_vm_info` | `vm` | Full VM configuration (JSON) |
| `get_vm_status` | `vm` | Lightweight status by name or UUID |
| `start_vm` | `vm` | Start a VM (auto-opens Parallels if needed) |
| `stop_vm` | `vm` | Gracefully stop a VM |
| `force_stop_vm` | `vm` | Force stop (`--kill`) |
| `restart_vm` | `vm` | Restart a VM (auto-opens Parallels if needed) |
| `pause_vm` | `vm` | Pause in memory |
| `resume_vm` | `vm` | Resume a suspended VM (auto-opens Parallels if needed) |
| `suspend_vm` | `vm` | Suspend to disk (saved state) |
| `drop_vm_state` | `vm` | Drop suspended state (`--drop-state`) |
| `list_snapshots` | `vm` | List snapshots for a VM |
| `create_snapshot` | `vm`, `name`, `description?` | Create a snapshot |
| `revert_to_snapshot` | `vm`, `snapshot_id`, `skip_resume?` | Revert to a snapshot |
| `delete_snapshot` | `vm`, `snapshot_id`, `include_children?` | Delete a snapshot |

`vm` accepts a display name (e.g. `Ubuntu 24.04 ARM64`) or UUID (with or without `{...}`). Run `list_vms` for exact names. For snapshots, run `list_snapshots` first to get snapshot IDs.

**Pause vs suspend:** `pause_vm` pauses in memory; `suspend_vm` saves state to disk.

**Auto-open:** `start_vm`, `resume_vm`, and `restart_vm` check for the Parallels GUI (`prl_client_app`, not background services only). If the GUI is not running, they run `open -a` and wait before `prlctl`. Set `PARALLELS_OPEN_IN_BACKGROUND=true` to use `open -g` instead.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PRLCTL_PATH` | `/usr/local/bin/prlctl` | Path to `prlctl` |
| `PARALLELS_APP_NAME` | `Parallels Desktop` | App name for `open -a` |
| `OPEN_PATH` | `/usr/bin/open` | Path to macOS `open` |
| `PGREP_PATH` | `/usr/bin/pgrep` | Path to `pgrep` for process detection |
| `PARALLELS_AUTO_OPEN_ON_VM_START` | `true` | Set `false` to disable auto-open on start/resume/restart |
| `PARALLELS_INIT_WAIT_MS` | `3000` | Milliseconds to wait after opening Parallels |
| `PARALLELS_OPEN_IN_BACKGROUND` | `false` | Set `true` to use `open -g` for auto-open (no focus steal) |

## Out of scope

Guest exec, clone/delete VM, file transfer, arbitrary `prlctl` commands.
