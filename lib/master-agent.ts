export async function runMasterAgent(userPrompt: string): Promise<string> {
    console.log("Master agent received:", userPrompt);
  
    const purchasedAgents = [
      {
        name: "OrgChartAgent",
        price: "$0.02",
        status: "payment confirmed",
      },
      {
        name: "StakeholderAgent",
        price: "$0.02",
        status: "payment confirmed",
      },
      {
        name: "CompetitorAgent",
        price: "$0.03",
        status: "payment confirmed",
      },
    ];
  
    return [
      "I purchased:",
      ...purchasedAgents.map(
        (agent) => `✓ ${agent.name} — ${agent.price} — ${agent.status}`
      ),
      "",
      "Recommended buyers:",
      "- VP/Director of Web Infrastructure",
      "- Platform Engineering leadership",
      "- Developer Experience leadership",
      "",
      "Pitch:",
      "Vercel is strongest where NVIDIA needs fast frontend iteration, preview deployments, Next.js optimization, and developer workflow velocity. Cloudflare remains strong for edge security/CDN, so the best wedge is not “replace everything,” but “move high-velocity marketing/docs/product microsites to Vercel first.”",
      "",
      "Note: For demo purposes, this uses public/mock intelligence providers. In production, these MCP providers could connect to TheOrg, LinkedIn-like data, Clearbit/Apollo-like contact data, BuiltWith-like tech-stack data, and internal CRM data.",
    ].join("\n");
  }
