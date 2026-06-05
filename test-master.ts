import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { runMasterAgent } = await import("./lib/master-agent");

  const answer = await runMasterAgent(
    "Give me Vercel's likely web infrastructure org tree.",
    "local-test-org-tree-thread"
  );

  console.log("\nFINAL ANSWER:\n");
  console.log(answer);
}

main().catch(console.error);
