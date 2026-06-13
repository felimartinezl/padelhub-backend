import Expo, { ExpoPushMessage, ExpoPushTicket } from "expo-server-sdk";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

const expo = new Expo();

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

// Maps notification data.type → preference key stored in users.notification_preferences
const TYPE_TO_PREF: Record<string, string> = {
  match_invitation:      "match_invitation",
  match_reminder:        "match_reminder",
  chat_message:          "chat_message",
  result_pending:        "match_result",
  result_confirmed:      "match_result",
  match_rating_received: "match_rating",
  suspension:            "suspension",
  suspension_lifted:     "suspension",
};

export const NOTIFICATION_PREF_KEYS = [
  "match_invitation",
  "match_reminder",
  "chat_message",
  "match_result",
  "match_rating",
  "suspension",
] as const;

export type NotificationPrefKey = (typeof NOTIFICATION_PREF_KEYS)[number];

// Returns default preferences (all enabled)
export function defaultPreferences(): Record<NotificationPrefKey, boolean> {
  return Object.fromEntries(NOTIFICATION_PREF_KEYS.map((k) => [k, true])) as Record<NotificationPrefKey, boolean>;
}

// Merges stored prefs (may have missing keys) with defaults
export function resolvePreferences(stored: unknown): Record<NotificationPrefKey, boolean> {
  const defaults = defaultPreferences();
  if (!stored || typeof stored !== "object") return defaults;
  const raw = stored as Record<string, unknown>;
  for (const key of NOTIFICATION_PREF_KEYS) {
    if (typeof raw[key] === "boolean") defaults[key] = raw[key] as boolean;
  }
  return defaults;
}

async function filterByPreferences(userIds: string[], notifType: string): Promise<string[]> {
  const prefKey = TYPE_TO_PREF[notifType];
  if (!prefKey) return userIds; // Unknown type → send to all

  const users = await prisma.users.findMany({
    where: { id: { in: userIds } },
    select: { id: true, notification_preferences: true },
  });

  return users
    .filter((u) => {
      const prefs = resolvePreferences(u.notification_preferences);
      return prefs[prefKey as NotificationPrefKey] !== false;
    })
    .map((u) => u.id);
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

async function persistNotifications(userIds: string[], payload: NotificationPayload): Promise<void> {
  if (userIds.length === 0) return;
  const type = (payload.data?.type as string) ?? "general";
  await prisma.notifications.createMany({
    data: userIds.map((user_id) => ({
      user_id,
      title: payload.title,
      body: payload.body,
      type,
      data: (payload.data ?? {}) as Prisma.InputJsonValue,
    })),
  });
}

export async function sendPushNotifications(
  userIds: string[],
  payload: NotificationPayload
): Promise<void> {
  if (userIds.length === 0) return;

  const notifType = (payload.data?.type as string) ?? "";

  // Persist to notification center for ALL users regardless of push preference
  persistNotifications(userIds, payload).catch(() => {});

  // Filter by push notification preferences
  const allowedIds = await filterByPreferences(userIds, notifType);
  if (allowedIds.length === 0) return;

  const tokenRecords = await getTokensForUsers(allowedIds);
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
