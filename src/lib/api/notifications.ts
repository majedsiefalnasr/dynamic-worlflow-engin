// ============================================================
// Notifications (read-only). GET /notifications (+ unread-count).
// Mark-read / archive / read-all are POST action endpoints that return 406
// (CR-12), so the screen is read-only in API mode (action buttons disabled).
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { Notif } from "@/lib/governance";

interface NotifDto {
  id: number;
  title: string;
  body?: string;
  type?: string;
  severity?: string;
  action_url?: string | null;
  created_at?: string | null;
  read_at?: string | null;
  recipient?: { read_at?: string | null } | null;
}

function relativeAr(iso?: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "الآن";
  if (min < 60) return `منذ ${min} دقيقة`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `منذ ${hr} ساعة`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "أمس";
  if (day < 7) return `منذ ${day} يوم`;
  return new Date(iso).toLocaleDateString("ar-EG");
}

function toNotif(d: NotifDto): Notif {
  const read = d.read_at ?? d.recipient?.read_at;
  return {
    id: String(d.id),
    title: d.title,
    body: d.body ?? "",
    time: relativeAr(d.created_at),
    unread: !read,
    audience: "all",
    href: d.action_url ?? undefined,
  };
}

export function useNotificationsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["notifications"],
    enabled,
    queryFn: ({ signal }) =>
      api
        .getList<NotifDto>("/notifications", { per_page: 100 }, signal)
        .then((r) => r.data.map(toNotif)),
  });
}
