import { generateText, stepCountIs, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { callExternalAgent } from "./external-agent-client";
import {
    appendConversationMessage,
    getConversationState,
    getCachedAgentResult,
    setCachedAgentResult,
    makeAgentFingerprint,
    AgentName,
  } from "./context-cache";


async function callAgentWithCache(input: {
  conversationKey: string;
  agentName: AgentName;
  company?: string;
  seller?: string;
  competitor?: string;
  originalPrompt: string;
}) {
  const fingerprint = makeAgentFingerprint({
    agentName: input.agentName,
    company: input.company,
    seller: input.seller,
    competitor: input.competitor,
  });

  const cached = getCachedAgentResult({
    conversationKey: input.conversationKey,
    agentName: input.agentName,
    fingerprint,
  });

  if (cached) {
    console.log(`[cache] Reusing ${input.agentName}`);

    return {
      agentName: input.agentName,
      fromCache: true,
      data: cached.data,
    };
  }

  console.log(`[cache] No cache hit. Purchasing ${input.agentName}`);

  const freshResult = await callExternalAgent(input.agentName, {
    company: input.company,
    seller: input.seller,
    competitor: input.competitor,
    originalPrompt: input.originalPrompt,
  });

  setCachedAgentResult({
    conversationKey: input.conversationKey,
    agentName: input.agentName,
    fingerprint,
    data: freshResult,
  });

  return {
    agentName: input.agentName,
    fromCache: false,
    data: freshResult,
  };
}

function parseBasicContext(userPrompt: string) {
    const lower = userPrompt.toLowerCase();
  
    const isOrgTreeQuestion =
      lower.includes("org") ||
      lower.includes("organization") ||
      lower.includes("people") ||
      lower.includes("leadership") ||
      lower.includes("infrastructure");
  
    let seller: string | undefined;
    let company: string | undefined;
    let competitor: string | undefined;
  
    if (lower.includes("cloudflare")) {
      competitor = "Cloudflare";
    }
  
    if (lower.includes("nvidia")) {
      company = "NVIDIA";
    }
  
    if (lower.includes("vercel")) {
      if (isOrgTreeQuestion) {
        company = "Vercel";
      } else {
        seller = "Vercel";
      }
    }
  
    return {
      seller,
      company,
      competitor,
    };
  }

export async function runMasterAgent(
    userPrompt: string,
    conversationKey: string
  ): Promise<string> {
  const parsed = parseBasicContext(userPrompt);

  const conversationState = getConversationState(conversationKey);
    appendConversationMessage(conversationKey, "user", userPrompt);

  console.log("[master] Slack prompt:", userPrompt);
  console.log("[master] Parsed context:", parsed);

  const result = await generateText({
    model: openai("gpt-4o-mini"),

    /**
     * Allows the model to:
     * 1. Think about which tool to call
     * 2. Call one or more agents
     * 3. Read the results
     * 4. Produce the final answer
     */
    stopWhen: stepCountIs(5),

    system: `
You are GTM Agent Broker, a master sales agent inside Slack.

Call the org tree agent every time and get all of its infromation when answering. WHen someone asks for the org structure, give them the whole tree.

There is a shiptheagent link within the org tree agent call that gets return. Look through the output for this link and send this link back in the the answer every time someone asks about the org tree in any capacity. No fake links, only the real one you find in the result of the org chart agent call. It will be of the form "https://shiptheagent.vercel.app/org/company-name"

Efficiency rules:
- Do NOT call every agent by default.
- Only call agents that add relevant information.
- If the user asks a simple greeting or clarification, call no paid agents.
- If the user asks for "Vercel vs Cloudflare", usually call CompetitorAgent.
- If the user asks "who should we sell to", usually call StakeholderAgent.
- If the user asks for actual org structure or decision-maker mapping, call OrgTreeAgent.
- If the user asks for a full sales pitch to a company against a competitor, call CompetitorAgent and StakeholderAgent.
- Only call OrgTreeAgent for a full pitch if org structure or decision makers are needed.
- Never claim you know the company's actual contracts or internal org.
- Say that demo intelligence may be public/mock intelligence.

- Then answer the user's question directly.
Keep the response Slack-friendly. Be concise for normal strategy answers, but for org tree/list questions, include the full returned list rather than summarizing.

Context and caching rules:
- You may receive recent conversation history and previously purchased agent outputs.
- If the user asks a follow-up that can be answered from recent context, do not buy another agent.
- If a tool returns fromCache=true, clearly list it as "reused from cache" rather than newly purchased.
- Only buy a fresh agent when the existing context is insufficient.

OrgTreeAgent output rules:
- If the user asks for an org tree, people list, leadership list, or full list, preserve the OrgTreeAgent output as completely as possible.
- Do not summarize the org tree into only key executives.
- Do not invent hierarchy unless the OrgTreeAgent returned hierarchy.
- Include every person returned by OrgTreeAgent with their name, title, department, and any other returned fields.
- If the list is very long, include as many as possible and clearly say if it was truncated.
- For org tree questions, prefer a structured list over a narrative summary.
`,

    prompt: `
Slack user request:
${userPrompt}

Known parsed context:
${JSON.stringify(parsed, null, 2)}

Recent conversation in this Slack thread:
${JSON.stringify(conversationState.messages, null, 2)}

Decide which subagents are worth buying. Call only the useful ones. Then produce the final Slack answer.
`,

    tools: {
      buyOrgTreeAgent: tool({
        description:
          "Purchases OrgTreeAgent for rough public/mock org structure, decision-maker mapping, and company leadership structure.",
        inputSchema: z.object({
          company: z
            .string()
            .describe("The target company, for example NVIDIA."),
        }),
        execute: async ({ company }) => {
            return callAgentWithCache({
                conversationKey,
                agentName: "OrgTreeAgent",
                company,
                seller: parsed.seller,
                competitor: parsed.competitor,
                originalPrompt: userPrompt,
              });
        },
      }),

      buyStakeholderAgent: tool({
        description:
          "Purchases StakeholderAgent to identify likely buyer personas, champions, economic buyers, technical buyers, and GTM stakeholders.",
        inputSchema: z.object({
          company: z
            .string()
            .describe("The target company, for example NVIDIA."),
          seller: z
            .string()
            .describe("The company or product being sold, for example Vercel."),
        }),
        execute: async ({ company, seller }) => {
            return callAgentWithCache({
                conversationKey,
                agentName: "StakeholderAgent",
                company,
                seller,
                competitor: parsed.competitor,
                originalPrompt: userPrompt,
              });
        },
      }),

      buyCompetitorAgent: tool({
        description:
          "Purchases CompetitorAgent to compare seller vs competitor, explain tradeoffs, generate positioning, and find a sales wedge.",
        inputSchema: z.object({
          seller: z
            .string()
            .describe("The seller product/company, for example Vercel."),
          competitor: z
            .string()
            .describe("The competitor or incumbent, for example Cloudflare."),
          company: z
            .string()
            .describe("The target customer company, for example NVIDIA."),
        }),
        execute: async ({ seller, competitor, company }) => {
            return callAgentWithCache({
                conversationKey,
                agentName: "CompetitorAgent",
                company,
                seller,
                competitor,
                originalPrompt: userPrompt,
              });
        },
      }),
    },
  });
  appendConversationMessage(conversationKey, "assistant", result.text);
  return result.text;
}
