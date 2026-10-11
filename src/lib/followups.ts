import "server-only";
import { listContacts, listOpenReminders } from "./db";
import { cadenceFor } from "./types";
import type { ReminderWithContact } from "./types";

export interface ReconnectCandidate {
  contactId: string;
  name: string;
  category: string;
  daysSince: number;
  cadenceDays: number;
  hint: string;
}

const DAY = 86_400_000;

export function getFollowUps(now = new Date()) {
  const reminders = listOpenReminders();
  const due: ReminderWithContact[] = [];
  const upcoming: ReminderWithContact[] = [];
  const weekAhead = now.getTime() + 7 * DAY;
  for (const r of reminders) {
    const t = new Date(r.dueAt).getTime();
    if (t <= now.getTime()) due.push(r);
    else if (t <= weekAhead) upcoming.push(r);
  }

  // Reconnect suggestions: people we haven't touched in longer than their
  // category's natural cadence, skipping anyone who already has a reminder.
  const withReminder = new Set(reminders.map((r) => r.contactId));
  const reconnect: ReconnectCandidate[] = listContacts()
    .filter((c) => !withReminder.has(c.id))
    .map((c) => {
      const last = new Date(c.lastInteractionAt ?? c.createdAt).getTime();
      const daysSince = Math.floor((now.getTime() - last) / DAY);
      const cadenceDays = cadenceFor(c.category);
      const hint =
        c.context?.collaboration?.[0] ??
        (c.context?.interests?.length ? `Ask about ${c.context.interests[0]}` : c.context?.summary ?? "");
      return { contactId: c.id, name: c.name, category: c.category, daysSince, cadenceDays, hint };
    })
    .filter((c) => c.daysSince >= c.cadenceDays)
    .sort((a, b) => b.daysSince / b.cadenceDays - a.daysSince / a.cadenceDays)
    .slice(0, 6);

  return { due, upcoming, reconnect };
}
