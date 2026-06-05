export type AgentName =
  | "OrgTreeAgent"
  | "StakeholderAgent"
  | "CompetitorAgent";

type CachedAgentResult = {
  agentName: AgentName;
  fingerprint: string;
  data: unknown;
  createdAt: number;
  expiresAt: number;
};

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: number;
};

type ConversationState = {
  messages: ConversationMessage[];
  agentResults: Partial<Record<AgentName, CachedAgentResult>>;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
};

const DEFAULT_TTL_MS = 20 * 60 * 1000; // 20 minutes

function getTtlMs() {
  return Number(process.env.CONTEXT_TTL_MS || DEFAULT_TTL_MS);
}

const conversations = new Map<string, ConversationState>();

function now() {
  return Date.now();
}

function isExpired(expiresAt: number) {
  return now() > expiresAt;
}

function pruneExpiredConversations() {
  for (const [key, value] of conversations.entries()) {
    if (isExpired(value.expiresAt)) {
      conversations.delete(key);
    }
  }
}

export function getConversationState(conversationKey: string) {
  pruneExpiredConversations();

  const existing = conversations.get(conversationKey);

  if (existing && !isExpired(existing.expiresAt)) {
    return existing;
  }

  const ttlMs = getTtlMs();

  const fresh: ConversationState = {
    messages: [],
    agentResults: {},
    createdAt: now(),
    updatedAt: now(),
    expiresAt: now() + ttlMs,
  };

  conversations.set(conversationKey, fresh);

  return fresh;
}

export function appendConversationMessage(
  conversationKey: string,
  role: "user" | "assistant",
  content: string
) {
  const state = getConversationState(conversationKey);
  const ttlMs = getTtlMs();

  state.messages.push({
    role,
    content,
    createdAt: now(),
  });

  // Keep only recent messages so the prompt does not get huge.
  state.messages = state.messages.slice(-8);

  state.updatedAt = now();
  state.expiresAt = now() + ttlMs;

  conversations.set(conversationKey, state);
}

export function makeAgentFingerprint(input: {
  agentName: AgentName;
  company?: string;
  seller?: string;
  competitor?: string;
}) {
  return JSON.stringify({
    agentName: input.agentName,
    company: input.company || null,
    seller: input.seller || null,
    competitor: input.competitor || null,
  });
}

export function getCachedAgentResult(input: {
  conversationKey: string;
  agentName: AgentName;
  fingerprint: string;
}) {
  const state = getConversationState(input.conversationKey);
  const cached = state.agentResults[input.agentName];

  if (!cached) {
    return null;
  }

  if (isExpired(cached.expiresAt)) {
    delete state.agentResults[input.agentName];
    return null;
  }

  if (cached.fingerprint !== input.fingerprint) {
    return null;
  }

  return cached;
}

export function setCachedAgentResult(input: {
  conversationKey: string;
  agentName: AgentName;
  fingerprint: string;
  data: unknown;
}) {
  const state = getConversationState(input.conversationKey);
  const ttlMs = getTtlMs();

  state.agentResults[input.agentName] = {
    agentName: input.agentName,
    fingerprint: input.fingerprint,
    data: input.data,
    createdAt: now(),
    expiresAt: now() + ttlMs,
  };

  state.updatedAt = now();
  state.expiresAt = now() + ttlMs;

  conversations.set(input.conversationKey, state);
}
