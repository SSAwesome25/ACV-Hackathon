import { App } from "@slack/bolt";
import { VercelReceiver, createHandler } from "@vercel/slack-bolt";
import { runMasterAgent } from "@/lib/master-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const receiver = new VercelReceiver();

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  receiver,
  deferInitialization: true,
});

app.event("app_mention", async ({ event, client }) => {
  const slackEvent = event as {
    text?: string;
    channel: string;
    ts: string;
    thread_ts?: string
  };

  try {
    const channel = slackEvent.channel;
    const threadTs = slackEvent.thread_ts || slackEvent.ts;
    const conversationKey = `${channel}:${threadTs}`;

    const userPrompt = (slackEvent.text || "")
      .replace(/<@[^>]+>/g, "")
      .trim();

    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: "Loading...",
    });

    const finalAnswer = await runMasterAgent(userPrompt, conversationKey);

    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: finalAnswer,
    });
  } catch (error) {
    console.error("Slack app_mention error:", error);

    await client.chat.postMessage({
      channel: slackEvent.channel,
      thread_ts: slackEvent.ts,
      text: "Something went wrong while running the GTM Agent Broker.",
    });
  }
});

export const POST = createHandler(app, receiver);
