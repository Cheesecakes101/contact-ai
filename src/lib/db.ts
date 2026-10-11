import "server-only";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  Category,
  Contact,
  Enrichment,
  Interaction,
  Reminder,
  ReminderWithContact,
  Room,
  RoomCard,
  StructuredContext,
} from "./types";

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "contacts.db");

declare global {
  // eslint-disable-next-line no-var
  var __contactDb: DatabaseSync | undefined;
}

function open(): DatabaseSync {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'acquaintance',
      raw_context TEXT NOT NULL DEFAULT '',
      context TEXT,
      enrichment TEXT,
      notes TEXT NOT NULL DEFAULT '',
      last_interaction_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS interactions (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'note',
      summary TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      due_at TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rooms (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      host_token TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      closed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS room_cards (
      id TEXT PRIMARY KEY,
      room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      profession TEXT NOT NULL DEFAULT '',
      links TEXT NOT NULL DEFAULT '[]',
      edit_token TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_interactions_contact ON interactions(contact_id, date);
    CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(done, due_at);
    CREATE INDEX IF NOT EXISTS idx_cards_room ON room_cards(room_code);
  `);
  return db;
}

export function db(): DatabaseSync {
  globalThis.__contactDb ??= open();
  return globalThis.__contactDb;
}

const now = () => new Date().toISOString();

function parseJson<T>(value: unknown): T | null {
  if (typeof value !== "string" || !value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

type Row = Record<string, unknown>;

function toContact(r: Row): Contact {
  return {
    id: r.id as string,
    name: r.name as string,
    phone: r.phone as string,
    email: r.email as string,
    company: r.company as string,
    role: r.role as string,
    category: r.category as Category,
    rawContext: r.raw_context as string,
    context: parseJson<StructuredContext>(r.context),
    enrichment: parseJson<Enrichment>(r.enrichment),
    notes: r.notes as string,
    lastInteractionAt: (r.last_interaction_at as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function toInteraction(r: Row): Interaction {
  return {
    id: r.id as string,
    contactId: r.contact_id as string,
    date: r.date as string,
    kind: r.kind as string,
    summary: r.summary as string,
    createdAt: r.created_at as string,
  };
}

function toReminder(r: Row): Reminder {
  return {
    id: r.id as string,
    contactId: r.contact_id as string,
    dueAt: r.due_at as string,
    note: r.note as string,
    done: Boolean(r.done),
    createdAt: r.created_at as string,
  };
}

// ---------- Contacts ----------

export function listContacts(): Contact[] {
  return (db().prepare("SELECT * FROM contacts ORDER BY updated_at DESC").all() as Row[]).map(toContact);
}

export function getContact(id: string): Contact | null {
  const r = db().prepare("SELECT * FROM contacts WHERE id = ?").get(id) as Row | undefined;
  return r ? toContact(r) : null;
}

export type ContactInput = Partial<
  Pick<
    Contact,
    | "name"
    | "phone"
    | "email"
    | "company"
    | "role"
    | "category"
    | "rawContext"
    | "context"
    | "enrichment"
    | "notes"
    | "lastInteractionAt"
  >
>;

const COLUMN: Record<keyof ContactInput, string> = {
  name: "name",
  phone: "phone",
  email: "email",
  company: "company",
  role: "role",
  category: "category",
  rawContext: "raw_context",
  context: "context",
  enrichment: "enrichment",
  notes: "notes",
  lastInteractionAt: "last_interaction_at",
};

function toDbValue(key: keyof ContactInput, value: unknown): string | null {
  if (key === "context" || key === "enrichment") return value ? JSON.stringify(value) : null;
  if (key === "lastInteractionAt") return (value as string) || null;
  return String(value ?? "");
}

export function createContact(input: ContactInput & { name: string }): Contact {
  const id = randomUUID();
  const ts = now();
  db()
    .prepare(
      `INSERT INTO contacts (id, name, phone, email, company, role, category, raw_context, context, enrichment, notes, last_interaction_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name.trim(),
      input.phone ?? "",
      input.email ?? "",
      input.company ?? "",
      input.role ?? "",
      input.category ?? "acquaintance",
      input.rawContext ?? "",
      input.context ? JSON.stringify(input.context) : null,
      input.enrichment ? JSON.stringify(input.enrichment) : null,
      input.notes ?? "",
      input.lastInteractionAt ?? null,
      ts,
      ts,
    );
  return getContact(id)!;
}

export function updateContact(id: string, input: ContactInput): Contact | null {
  const keys = (Object.keys(input) as (keyof ContactInput)[]).filter((k) => k in COLUMN && input[k] !== undefined);
  if (keys.length) {
    const sets = keys.map((k) => `${COLUMN[k]} = ?`).join(", ");
    const values = keys.map((k) => toDbValue(k, input[k]));
    db()
      .prepare(`UPDATE contacts SET ${sets}, updated_at = ? WHERE id = ?`)
      .run(...values, now(), id);
  }
  return getContact(id);
}

export function deleteContact(id: string): void {
  db().prepare("DELETE FROM contacts WHERE id = ?").run(id);
}

// ---------- Interactions ----------

export function listInteractions(contactId: string): Interaction[] {
  return (
    db()
      .prepare("SELECT * FROM interactions WHERE contact_id = ? ORDER BY date DESC, created_at DESC")
      .all(contactId) as Row[]
  ).map(toInteraction);
}

export function addInteraction(contactId: string, date: string, kind: string, summary: string): Interaction {
  const id = randomUUID();
  db()
    .prepare("INSERT INTO interactions (id, contact_id, date, kind, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, contactId, date, kind, summary, now());
  syncLastInteraction(contactId);
  return toInteraction(db().prepare("SELECT * FROM interactions WHERE id = ?").get(id) as Row);
}

export function deleteInteraction(id: string): void {
  const r = db().prepare("SELECT contact_id FROM interactions WHERE id = ?").get(id) as Row | undefined;
  db().prepare("DELETE FROM interactions WHERE id = ?").run(id);
  if (r) syncLastInteraction(r.contact_id as string);
}

function syncLastInteraction(contactId: string) {
  const r = db().prepare("SELECT MAX(date) AS d FROM interactions WHERE contact_id = ?").get(contactId) as Row;
  db()
    .prepare("UPDATE contacts SET last_interaction_at = ?, updated_at = ? WHERE id = ?")
    .run((r.d as string) ?? null, now(), contactId);
}

// ---------- Reminders ----------

export function listReminders(contactId: string): Reminder[] {
  return (
    db()
      .prepare("SELECT * FROM reminders WHERE contact_id = ? ORDER BY done ASC, due_at ASC")
      .all(contactId) as Row[]
  ).map(toReminder);
}

export function listOpenReminders(): ReminderWithContact[] {
  return (
    db()
      .prepare(
        `SELECT r.*, c.name AS contact_name FROM reminders r JOIN contacts c ON c.id = r.contact_id
         WHERE r.done = 0 ORDER BY r.due_at ASC`,
      )
      .all() as Row[]
  ).map((r) => ({ ...toReminder(r), contactName: r.contact_name as string }));
}

export function addReminder(contactId: string, dueAt: string, note: string): Reminder {
  const id = randomUUID();
  db()
    .prepare("INSERT INTO reminders (id, contact_id, due_at, note, done, created_at) VALUES (?, ?, ?, ?, 0, ?)")
    .run(id, contactId, dueAt, note, now());
  return toReminder(db().prepare("SELECT * FROM reminders WHERE id = ?").get(id) as Row);
}

export function updateReminder(id: string, patch: { done?: boolean; dueAt?: string }): void {
  if (patch.done !== undefined) db().prepare("UPDATE reminders SET done = ? WHERE id = ?").run(patch.done ? 1 : 0, id);
  if (patch.dueAt) db().prepare("UPDATE reminders SET due_at = ? WHERE id = ?").run(patch.dueAt, id);
}

export function deleteReminder(id: string): void {
  db().prepare("DELETE FROM reminders WHERE id = ?").run(id);
}

// ---------- Contact Drop rooms ----------

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function randomCode(len = 6): string {
  const bytes = randomBytes(len);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

function toRoom(r: Row): Room {
  return {
    code: r.code as string,
    name: r.name as string,
    status: r.status as Room["status"],
    createdAt: r.created_at as string,
    closedAt: (r.closed_at as string) ?? null,
  };
}

function toCard(r: Row): RoomCard {
  return {
    id: r.id as string,
    roomCode: r.room_code as string,
    name: r.name as string,
    phone: r.phone as string,
    email: r.email as string,
    profession: r.profession as string,
    links: parseJson<string[]>(r.links) ?? [],
    createdAt: r.created_at as string,
  };
}

export function createRoom(name: string): { room: Room; hostToken: string } {
  let code = randomCode();
  while (db().prepare("SELECT 1 FROM rooms WHERE code = ?").get(code)) code = randomCode();
  const hostToken = randomBytes(24).toString("base64url");
  db()
    .prepare("INSERT INTO rooms (code, name, host_token, status, created_at) VALUES (?, ?, ?, 'open', ?)")
    .run(code, name, hostToken, now());
  return { room: getRoom(code)!, hostToken };
}

export function getRoom(code: string): Room | null {
  const r = db().prepare("SELECT * FROM rooms WHERE code = ?").get(code.toUpperCase()) as Row | undefined;
  return r ? toRoom(r) : null;
}

export function isRoomHost(code: string, token: string | null | undefined): boolean {
  if (!token) return false;
  const r = db().prepare("SELECT host_token FROM rooms WHERE code = ?").get(code.toUpperCase()) as Row | undefined;
  return !!r && r.host_token === token;
}

export function closeRoom(code: string): void {
  db().prepare("UPDATE rooms SET status = 'closed', closed_at = ? WHERE code = ?").run(now(), code.toUpperCase());
}

export function listRoomCards(code: string): RoomCard[] {
  return (
    db().prepare("SELECT * FROM room_cards WHERE room_code = ? ORDER BY created_at ASC").all(code.toUpperCase()) as Row[]
  ).map(toCard);
}

export function countRoomCards(code: string): number {
  const r = db().prepare("SELECT COUNT(*) AS n FROM room_cards WHERE room_code = ?").get(code.toUpperCase()) as Row;
  return Number(r.n);
}

export function upsertRoomCard(
  code: string,
  card: Omit<RoomCard, "id" | "roomCode" | "createdAt">,
  editToken?: string,
): { card: RoomCard; editToken: string } {
  const room = code.toUpperCase();
  if (editToken) {
    const existing = db()
      .prepare("SELECT id FROM room_cards WHERE room_code = ? AND edit_token = ?")
      .get(room, editToken) as Row | undefined;
    if (existing) {
      db()
        .prepare("UPDATE room_cards SET name = ?, phone = ?, email = ?, profession = ?, links = ? WHERE id = ?")
        .run(card.name, card.phone, card.email, card.profession, JSON.stringify(card.links), existing.id as string);
      return { card: toCard(db().prepare("SELECT * FROM room_cards WHERE id = ?").get(existing.id as string) as Row), editToken };
    }
  }
  const id = randomUUID();
  const token = randomBytes(18).toString("base64url");
  db()
    .prepare(
      "INSERT INTO room_cards (id, room_code, name, phone, email, profession, links, edit_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(id, room, card.name, card.phone, card.email, card.profession, JSON.stringify(card.links), token, now());
  return { card: toCard(db().prepare("SELECT * FROM room_cards WHERE id = ?").get(id) as Row), editToken: token };
}
