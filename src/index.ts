#!/usr/bin/env node

import { McpServer, StdioServerTransport } from "@modelcontextprotocol/server";
import { initPrlctl, PRLCTL_PATH, prlctlAvailable } from "./prlctl.js";
import { registerParallelsTools } from "./tools.js";

async function main(): Promise<void> {
  await initPrlctl();

  if (prlctlAvailable) {
    console.error(`simple-parallels: using prlctl at ${PRLCTL_PATH}`);
  } else {
    console.error(
      `simple-parallels: prlctl not found at ${PRLCTL_PATH}. Tools will return an error until CLI tools are installed.`,
    );
  }

  const server = new McpServer({ name: "simple-parallels", version: "1.0.0" });
  registerParallelsTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("simple-parallels fatal error:", error);
  process.exit(1);
});
