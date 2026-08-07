import { z } from "zod";

export const notificationSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  href: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

export const notificationsResponseSchema = z.object({
  unreadCount: z.number(),
  items: z.array(notificationSchema),
});
export type NotificationsResponse = z.infer<typeof notificationsResponseSchema>;
