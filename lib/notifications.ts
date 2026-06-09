import Expo, { ExpoPushMessage, ExpoPushTicket } from "expo-server-sdk";
import { prisma } from "./prisma";

const expo = new Expo();

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

async function getTokensForUsers(userIds: string[]): Promise<{ token: string; id: string }[]> {
  const records = await prisma.device_tokens.findMany({
    where: { user_id: { in: userIds } },
    select: { token: true, id: true },
  });
  return records.filter((r) => Expo.isExpoPushToken(r.token));
}

async function removeInvalidTokens(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await prisma.device_tokens.deleteMany({ where: { id: { in: ids } } });
}

export async function sendPushNotifications(
  userIds: string[],
  payload: NotificationPayload
): Promise<void> {
  if (userIds.length === 0) return;

  const tokenRecords = await getTokensForUsers(userIds);
  if (tokenRecords.length === 0) return;

  const messages: ExpoPushMessage[] = tokenRecords.map((r) => ({
    to: r.token,
    sound: "default",
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
  }));

  const chunks = expo.chunkPushNotifications(messages);
  const invalidIds: string[] = [];

  for (const chunk of chunks) {
    let tickets: ExpoPushTicket[];
    try {
      tickets = await expo.sendPushNotificationsAsync(chunk);
    } catch {
      continue;
    }

    tickets.forEach((ticket, i) => {
      if (ticket.status === "error") {
        const details = (ticket as any).details;
        if (details?.error === "DeviceNotRegistered") {
          invalidIds.push(tokenRecords[i].id);
        }
      }
    });
  }

  await removeInvalidTokens(invalidIds);
}
