/**
 * Plain-chat WebSocket fan-out.
 *
 * Plain messages are routed by userId rather than deviceId — all connected
 * devices for a user receive the event simultaneously.
 */
import { publishMessage } from "./redis.js";
import type { WsServerMessage } from "@seclettr/protocol";

type PlainWsEvent = Extract<
  WsServerMessage,
  { type: "plain_message.new" | "plain_message.edited" | "plain_message.deleted" | "plain_message.read" }
>;

export async function publishPlainMessageToUser(
  userId: string,
  event: PlainWsEvent
): Promise<void> {
  await publishMessage({
    scope: "user",
    recipientUserId: userId,
    ...event,
  });
}
