type AgentName = "OrgTreeAgent" | "StakeholderAgent" | "CompetitorAgent";

type ExternalAgentInput = {
  company?: string;
  seller?: string;
  competitor?: string;
  originalPrompt: string;
};

const AGENT_TIMEOUT_MS = 15000;

function shouldUseMockAgents() {
  return process.env.USE_MOCK_AGENTS === "true";
}

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Either add it or set USE_MOCK_AGENTS=true.`
    );
  }

  return value;
}

function getAgentUrl(agentName: AgentName) {
  if (agentName === "OrgTreeAgent") {
    return getRequiredEnv("ORG_TREE_AGENT_URL");
  }

  if (agentName === "StakeholderAgent") {
    return getRequiredEnv("STAKEHOLDER_AGENT_URL");
  }

  if (agentName === "CompetitorAgent") {
    return getRequiredEnv("COMPETITOR_AGENT_URL");
  }

  throw new Error(`Unknown agent: ${agentName}`);
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}

function getMockAgentResponse(agentName: AgentName, input: ExternalAgentInput) {
  const company = input.company || "NVIDIA";
  const seller = input.seller || "Vercel";
  const competitor = input.competitor || "Cloudflare";

  console.log(`[mock] ${agentName} purchased`);

  if (agentName === "OrgTreeAgent") {
    return {
      agentName,
      data: {
        agent: {
          name: "OrgTreeAgent",
          price: "$0.02",
          paymentStatus: "confirmed_mock",
        },
        data: {
          company,
          disclaimer:
            "Mock/demo org data only. This is not verified internal company information.",
          likelyOrgTree: [
            {
              title: "CTO / Chief Architect",
              relevance: "Owns technical strategy and architecture standards.",
            },
            {
              title: "VP Platform Engineering",
              relevance:
                "Likely evaluates developer platforms, deployment workflows, and infrastructure standards.",
            },
            {
              title: "Director Web Infrastructure",
              relevance:
                "Likely owns frontend hosting, web performance, routing, and reliability.",
            },
            {
              title: "Developer Experience Lead",
              relevance:
                "Cares about preview deployments, build speed, and developer workflow.",
            },
          ],
        },
      },
    };
  }

  if (agentName === "StakeholderAgent") {
    return {
      agentName,
      data: {
        agent: {
          name: "StakeholderAgent",
          price: "$0.02",
          paymentStatus: "confirmed_mock",
        },
        data: {
          company,
          seller,
          buyerPersonas: [
            {
              persona: "VP Platform Engineering",
              whyTheyCare:
                "Owns developer productivity, internal platforms, and deployment standards.",
            },
            {
              persona: "Director Web Infrastructure",
              whyTheyCare:
                "Responsible for web reliability, frontend infrastructure, and performance.",
            },
            {
              persona: "Developer Experience Lead",
              whyTheyCare:
                "Cares about making it easier and faster for engineers to ship.",
            },
            {
              persona: "Marketing Web / Growth Engineering Lead",
              whyTheyCare:
                "Owns fast-changing public web properties like campaign pages, docs, and product pages.",
            },
          ],
        },
      },
    };
  }

  if (agentName === "CompetitorAgent") {
    return {
      agentName,
      data: {
        agent: {
          name: "CompetitorAgent",
          price: "$0.03",
          paymentStatus: "confirmed_mock",
        },
        data: {
          seller,
          competitor,
          target: company,
          whereSellerWins: [
            "Preview deployments",
            "Next.js optimization",
            "Frontend developer workflow",
            "Fast iteration for docs, marketing pages, and product microsites",
            "Git-native deployment experience",
          ],
          whereCompetitorWins: [
            "Broad CDN footprint",
            "Edge security",
            "DDoS protection",
            "Network-level controls",
          ],
          recommendedWedge:
            "Do not pitch a full Cloudflare replacement. Pitch Vercel as the specialized frontend cloud for high-velocity web surfaces.",
        },
      },
    };
  }

  throw new Error(`Unknown mock agent: ${agentName}`);
}

export async function callExternalAgent(
  agentName: AgentName,
  input: ExternalAgentInput
) {
  if (shouldUseMockAgents()) {
    return getMockAgentResponse(agentName, input);
  }

  const url = getAgentUrl(agentName);

  console.log(`[master] Calling ${agentName}: ${url}`);

  const isOrgTreeAgent = agentName === "OrgTreeAgent";

    const response = await fetchWithTimeout(
    url,
    isOrgTreeAgent
        ? {
            method: "GET",
            headers: {
            "Content-Type": "application/json",
            "x-agent-broker-secret": process.env.AGENT_SHARED_SECRET || "",
            "x-payment-mode": "demo",
            },
        }
        : {
            method: "POST",
            headers: {
            "Content-Type": "application/json",
            "x-agent-broker-secret": process.env.AGENT_SHARED_SECRET || "",
            "x-payment-mode": "demo",
            },
            body: JSON.stringify({
            company: input.company,
            seller: input.seller,
            competitor: input.competitor,
            prompt: input.originalPrompt,
            }),
        },
    AGENT_TIMEOUT_MS
    );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `${agentName} failed with status ${response.status}: ${errorText}`
    );
  }

  const data = await response.json();

  console.log(`[master] ${agentName} returned:`, data);

  return {
    agentName,
    data,
  };
}
