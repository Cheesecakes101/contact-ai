export const CATEGORIES = [
  { id: "close_friend", label: "Close friend", cadenceDays: 21 },
  { id: "friend", label: "Friend", cadenceDays: 45 },
  { id: "acquaintance", label: "Acquaintance", cadenceDays: 120 },
  { id: "professional", label: "Professional", cadenceDays: 90 },
] as const;

export type Category = (typeof CATEGORIES)[number]["id"];

export function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export function cadenceFor(id: string): number {
  return CATEGORIES.find((c) => c.id === id)?.cadenceDays ?? 90;
}

/** What the AI pulls out of a voice note / text about someone. */
export interface StructuredContext {
  summary: string;
  metWhere: string;
  metHow: string;
  whatTheyDo: string;
  interests: string[];
  collaboration: string[];
  tags: string[];
  suggestedCategory?: Category | "";
  followUp?: string;
}

/** Public-web enrichment. Always AI-estimated and unverified. */
export interface Enrichment {
  summary: string;
  role: string;
  company: string;
  linkedin: string;
  location: string;
  mentions: { title: string; url: string }[];
  sources: string[];
  confidence: "low" | "medium" | "high";
  fetchedAt: string;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string;
  company: string;
  role: string;
  category: Category;
  rawContext: string;
  context: StructuredContext | null;
  enrichment: Enrichment | null;
  notes: string;
  lastInteractionAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Interaction {
  id: string;
  contactId: string;
  date: string;
  kind: string;
  summary: string;
  createdAt: string;
}

export interface Reminder {
  id: string;
  contactId: string;
  dueAt: string;
  note: string;
  done: boolean;
  createdAt: string;
}

export interface ReminderWithContact extends Reminder {
  contactName: string;
}

export interface Room {
  code: string;
  name: string;
  status: "open" | "closed";
  createdAt: string;
  closedAt: string | null;
}

export interface RoomCard {
  id: string;
  roomCode: string;
  name: string;
  phone: string;
  email: string;
  profession: string;
  links: string[];
  createdAt: string;
}
