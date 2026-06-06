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
  originalPrompt: string;
}) {
  const fingerprint = makeAgentFingerprint({
    agentName: input.agentName,
    company: input.company,
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

function parseCompanyFromPrompt(userPrompt: string) {
  const lower = userPrompt.toLowerCase();

  if (lower.includes("vercel")) return "Vercel";
  if (lower.includes("nvidia")) return "NVIDIA";
  if (lower.includes("cloudflare")) return "Cloudflare";
  if (lower.includes("openai")) return "OpenAI";
  if (lower.includes("stripe")) return "Stripe";

  return undefined;
}

export async function runMasterAgent(
  userPrompt: string,
  conversationKey: string
): Promise<string> {
  const company = parseCompanyFromPrompt(userPrompt);

  const conversationState = getConversationState(conversationKey);
  appendConversationMessage(conversationKey, "user", userPrompt);

  console.log("[master] Slack prompt:", userPrompt);
  console.log("[master] Parsed company:", company);

  const result = await generateText({
    model: openai("gpt-4o-mini"),

    stopWhen: stepCountIs(3),

    system: `
You are GTM Agent Broker, a master sales agent inside Slack.

Right now, you only have access to one paid subagent:

OrgTreeAgent:
- Use it whenever the user asks about org tree information, people, leadership, company structure, reporting structure, departments, executives, or decision makers.
- Do not call any stakeholder agent.
- Do not call any competitor agent.
- Do not mention stakeholder or competitor agents.

Important OrgTreeAgent rules:
- If the user asks for an org tree, call OrgTreeAgent.
- Preserve the OrgTreeAgent output as completely as possible.
- Do not summarize the org tree into only key executives.
- Do not invent hierarchy unless the OrgTreeAgent returned hierarchy.
- Include every person returned by OrgTreeAgent with their name, title, department, and any other returned fields.
- If the OrgTreeAgent returns a shiptheagent link, include that exact link in the answer.
- The link may look like "https://shiptheagent.vercel.app/org/Vercel".
- Do not create fake links. Only include a link if it appears in the OrgTreeAgent result.
- If the list is very long, include as many as possible and clearly say if it was truncated.

Context and caching rules:
- You may receive recent conversation history and previously purchased OrgTreeAgent outputs.
- If the user asks a follow-up that can be answered from recent context, reuse context.
- If the tool returns fromCache=true, say "Reused from cache: OrgTreeAgent".
- If it is a fresh call, say "I purchased: OrgTreeAgent".

Final answer rules:
- Keep the response Slack-friendly.
- For org tree/list questions, include the full returned list rather than summarizing.
- If OrgTreeAgent returns no useful data, say that clearly.
`,

    prompt: `
Slack user request:
${userPrompt}

Parsed company:
${company || "Unknown"}

Recent conversation in this Slack thread:
${JSON.stringify(conversationState.messages, null, 2)}

Use OrgTreeAgent only if org tree / people / leadership / structure information is needed. Then produce the final Slack answer.
`,

    tools: {
      buyOrgTreeAgent: tool({
        description:
          "Purchases or reuses OrgTreeAgent for org structure, leadership, people lists, company hierarchy, and decision-maker mapping.",
        inputSchema: z.object({
          company: z
            .string()
            .describe("The target company, for example Vercel or NVIDIA."),
        }),
        execute: async ({ company: toolCompany }) => {
          return callAgentWithCache({
            conversationKey,
            agentName: "OrgTreeAgent",
            company: toolCompany || company || "Vercel",
            originalPrompt: userPrompt,
          });
        },
      }),
    },
  });

  appendConversationMessage(conversationKey, "assistant", result.text);

  return result.text;
}
