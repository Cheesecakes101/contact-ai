import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Contact, Enrichment, Interaction, StructuredContext } from "./types";
import { CATEGORIES, categoryLabel } from "./types";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
// Structuring a note is plain extraction, so use a fast model to keep "Organise with AI" snappy.
const FAST_MODEL = process.env.ANTHROPIC_FAST_MODEL || "claude-haiku-5-5";

// Server-side refusal fallback: if the model declines for policy reasons, the API
// re-runs the request on a default fallback model inside the same call.
const FALLBACK: { betas: Anthropic.Beta.AnthropicBeta[]; fallbacks: "default" } = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  _client ??= new Anthropic();
  return _client;
}

export class AIUnavailableError extends Error {
  constructor() {
    super("AI is not configured. Set ANTHROPIC_API_KEY to enable it.");
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// 1. Structure free-form context (voice note transcript or typed text)
// ---------------------------------------------------------------------------

const StructuredSchema = z.object({
  summary: z.string().describe("One or two sentence summary of who this person is to the user."),
  metWhere: z.string().describe("Event / place where they met, e.g. 'Night School demo day, London'. Empty if unknown."),
  metHow: z.string().describe("How they met / who introduced them. Empty if unknown."),
  whatTheyDo: z.string().describe("Their job, company, projects. Empty if unknown."),
  company: z.string().describe("Company / organisation name only, if mentioned. Empty if unknown."),
  role: z
    .string()
    .describe("Job title exactly as the user stated it (e.g. 'runs ops' → 'Operations'). Don't upgrade it into a formal title. Empty if unknown."),
  interests: z.array(z.string()).describe("Personal and professional interests, short phrases."),
  collaboration: z
    .array(z.string())
    .describe("Concrete ways the user and this person could help each other or collaborate."),
  tags: z
    .array(z.string())
    .describe("3-8 short lowercase tags useful for search, e.g. 'venture capital', 'jewellery', 'london'."),
  suggestedCategory: z.enum(["close_friend", "friend", "acquaintance", "professional"]),
  followUp: z.string().describe("Any follow-up the user mentioned (e.g. 'send deck next week'). Empty if none."),
});

export type StructureResult = StructuredContext & { company: string; role: string };

const STRUCTURE_SYSTEM = `You help someone keep a personal relationship memory. They describe a person they know, often as a rambling voice-note transcript. Extract what they said into the structured fields.

Rules:
- Only use what the user said. Never invent facts. Leave a field empty ("" or []) when it wasn't mentioned.
- Clean up transcription errors and filler words, keep proper nouns as spoken.
- Write in the user's voice where natural ("Met at…", not "The user met…").
- Tags: lowercase, short, include industry, location, event and skill keywords that someone might search for later.
- Collaboration: be specific and practical, grounded in what was said about both people.
- suggestedCategory: close_friend / friend / acquaintance / professional based on the tone and relationship described.`;

export async function structureContext(input: {
  name: string;
  text: string;
  existing?: StructuredContext | null;
}): Promise<StructureResult> {
  if (!aiEnabled()) return fallbackStructure(input.text, input.existing);

  const existing = input.existing
    ? `\n\nExisting structured context for this person (merge new information into it, keep what is still true):\n${JSON.stringify(input.existing)}`
    : "";

  const response = await client().beta.messages.parse(
    {
      model: FAST_MODEL,
      max_tokens: 2000,
      ...FALLBACK,
      output_config: { format: betaZodOutputFormat(StructuredSchema) },
      system: STRUCTURE_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Today is ${today()}. Person: ${input.name || "(name not given)"}${existing}\n\nWhat I said about them:\n"""\n${input.text}\n"""`,
        },
      ],
    },
    // Fail fast instead of hanging on the SDK's 10-minute default.
    { timeout: 45_000, maxRetries: 1 },
  );
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    return fallbackStructure(input.text, input.existing);
  }
  return response.parsed_output;
}

function fallbackStructure(text: string, existing?: StructuredContext | null): StructureResult {
  const tags = Array.from(new Set((text.match(/#[\w-]+/g) ?? []).map((t) => t.slice(1).toLowerCase())));
  return {
    summary: existing?.summary || text.slice(0, 240),
    metWhere: existing?.metWhere ?? "",
    metHow: existing?.metHow ?? "",
    whatTheyDo: existing?.whatTheyDo ?? "",
    company: "",
    role: "",
    interests: existing?.interests ?? [],
    collaboration: existing?.collaboration ?? [],
    tags: Array.from(new Set([...(existing?.tags ?? []), ...tags])),
    suggestedCategory: "",
    followUp: "",
  };
}

// ---------------------------------------------------------------------------
// 2. Natural-language search over the user's contacts
// ---------------------------------------------------------------------------

const SearchSchema = z.object({
  answer: z.string().describe("A short, direct one-sentence answer to the question."),
  matches: z.array(
    z.object({
      id: z.string(),
      reason: z.string().describe("Why this person matches, citing the specific context. Max ~20 words."),
      strength: z.enum(["strong", "possible"]),
    }),
  ),
});

export interface SearchMatch {
  id: string;
  reason: string;
  strength: "strong" | "possible";
}

function compactContact(c: Contact, interactions: Interaction[] = []) {
  return {
    id: c.id,
    name: c.name,
    category: categoryLabel(c.category),
    company: c.company || undefined,
    role: c.role || undefined,
    summary: c.context?.summary || undefined,
    metWhere: c.context?.metWhere || undefined,
    metHow: c.context?.metHow || undefined,
    whatTheyDo: c.context?.whatTheyDo || undefined,
    interests: c.context?.interests?.length ? c.context.interests : undefined,
    collaboration: c.context?.collaboration?.length ? c.context.collaboration : undefined,
    tags: c.context?.tags?.length ? c.context.tags : undefined,
    notes: c.notes ? c.notes.slice(0, 500) : undefined,
    rawContext: !c.context && c.rawContext ? c.rawContext.slice(0, 500) : undefined,
    webUnverified: c.enrichment
      ? { role: c.enrichment.role || undefined, company: c.enrichment.company || undefined, summary: c.enrichment.summary || undefined }
      : undefined,
    addedOn: c.createdAt.slice(0, 10),
    lastInteraction: c.lastInteractionAt ?? undefined,
    recentInteractions: interactions.slice(0, 3).map((i) => `${i.date.slice(0, 10)}: ${i.summary}`),
  };
}

export async function searchContacts(
  query: string,
  contacts: Contact[],
  interactionsByContact: Map<string, Interaction[]>,
): Promise<{ answer: string; matches: SearchMatch[]; mode: "ai" | "keyword" }> {
  if (!aiEnabled() || contacts.length === 0) {
    return { answer: "", matches: keywordSearch(query, contacts), mode: "keyword" };
  }
  const directory = JSON.stringify(contacts.map((c) => compactContact(c, interactionsByContact.get(c.id))));
  const response = await client().beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    ...FALLBACK,
    output_config: { effort: "low", format: betaZodOutputFormat(SearchSchema) },
    system: [
      {
        type: "text",
        text: `You search someone's personal contact book and answer questions like "Who do I know in venture capital?", "Who did I meet at Night School?" or "Who can help me with jewellery?".

Return the contacts that genuinely match, best first. Use reasoning across fields: someone who "works at Sequoia" is in venture capital; someone who "makes rings" can help with jewellery. Mark weaker, inferred matches as "possible". Fields under "webUnverified" come from an unverified web search — you may use them but prefer the user's own notes. Only return ids that exist in the directory. Return an empty list if nobody matches.`,
      },
      { type: "text", text: `Contact directory (JSON):\n${directory}`, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: `Today is ${today()}. Question: ${query}` }],
  });
  const parsed = response.parsed_output;
  if (response.stop_reason === "refusal" || !parsed) {
    return { answer: "", matches: keywordSearch(query, contacts), mode: "keyword" };
  }
  const ids = new Set(contacts.map((c) => c.id));
  return { answer: parsed.answer, matches: parsed.matches.filter((m) => ids.has(m.id)), mode: "ai" };
}

const STOPWORDS = new Set(
  "who what where do does did i me my know knows met meet can could help with in at the a an for of to on is are someone anyone people person".split(" "),
);

export function keywordSearch(query: string, contacts: Contact[]): SearchMatch[] {
  const terms = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
  if (!terms.length) return [];
  const scored = contacts
    .map((c) => {
      const hay = JSON.stringify(compactContact(c)).toLowerCase();
      const hits = terms.filter((t) => hay.includes(t));
      return { c, hits };
    })
    .filter((x) => x.hits.length > 0)
    .sort((a, b) => b.hits.length - a.hits.length);
  return scored.map(({ c, hits }) => ({
    id: c.id,
    reason: `Mentions ${hits.map((h) => `“${h}”`).join(", ")}`,
    strength: hits.length === terms.length ? "strong" : "possible",
  }));
}

// ---------------------------------------------------------------------------
// 3. Light public web enrichment (always labelled AI-estimated / unverified)
// ---------------------------------------------------------------------------

const EnrichmentSchema = z.object({
  summary: z.string().describe("2-3 sentence public profile summary. Empty if nothing reliable was found."),
  role: z.string(),
  company: z.string(),
  linkedin: z.string().describe("LinkedIn profile URL if found, else empty."),
  location: z.string(),
  mentions: z.array(z.object({ title: z.string(), url: z.string() })).describe("Up to 5 notable public mentions."),
  confidence: z
    .enum(["low", "medium", "high"])
    .describe("How confident you are these results are about THIS person rather than a namesake."),
});

export async function enrichContact(contact: Contact): Promise<Enrichment> {
  if (!aiEnabled()) throw new AIUnavailableError();

  const known = [
    contact.company && `company: ${contact.company}`,
    contact.role && `role: ${contact.role}`,
    contact.email && `email domain: ${contact.email.split("@")[1] ?? ""}`,
    contact.context?.whatTheyDo && `what they do: ${contact.context.whatTheyDo}`,
    contact.context?.metWhere && `met at: ${contact.context.metWhere}`,
    contact.context?.tags?.length && `tags: ${contact.context.tags.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  // Step 1: research with the web search server tool.
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: `Do a light public web search on this person to enrich a private contact card.

Name: ${contact.name}
${known || "(no other details)"}

Look for: LinkedIn profile, current company and role, location, and a few public mentions (talks, articles, company pages). Use the known details to make sure you have the right person and not a namesake. Keep it to a few searches. Then write a short factual report with the URLs you relied on. If you can't confidently identify them, say so.`,
    },
  ];
  const sources = new Set<string>();
  let report = "";
  for (let turn = 0; turn < 4; turn++) {
    const response = await client().beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      ...FALLBACK,
      output_config: { effort: "low" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
      messages,
    });
    for (const block of response.content) {
      if (block.type === "text") report += block.text;
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) if (r.type === "web_search_result") sources.add(r.url);
      }
    }
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    break;
  }

  // Step 2: structure the report.
  const parsed = await client().beta.messages.parse({
    model: MODEL,
    max_tokens: 3000,
    ...FALLBACK,
    output_config: { effort: "low", format: betaZodOutputFormat(EnrichmentSchema) },
    messages: [
      {
        role: "user",
        content: `Extract a contact enrichment from this web research report about ${contact.name}. Only include facts stated in the report. Use "" for anything unknown.\n\nReport:\n${report || "(no findings)"}\n\nURLs seen:\n${[...sources].join("\n")}`,
      },
    ],
  });
  const out = parsed.parsed_output;
  return {
    summary: out?.summary ?? "",
    role: out?.role ?? "",
    company: out?.company ?? "",
    linkedin: out?.linkedin ?? "",
    location: out?.location ?? "",
    mentions: (out?.mentions ?? []).slice(0, 5),
    sources: [...sources].slice(0, 10),
    confidence: out?.confidence ?? "low",
    fetchedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 4. Reconnect suggestions
// ---------------------------------------------------------------------------

const ReconnectSchema = z.object({
  why: z.string().describe("One sentence on why now is a good time to reconnect."),
  message: z.string().describe("A short, warm, natural text message the user could send. No emojis unless fitting."),
});

export async function draftReconnect(contact: Contact, interactions: Interaction[]) {
  if (!aiEnabled()) throw new AIUnavailableError();
  const response = await client().beta.messages.parse({
    model: MODEL,
    max_tokens: 2000,
    ...FALLBACK,
    output_config: { effort: "low", format: betaZodOutputFormat(ReconnectSchema) },
    system:
      "You help someone stay in touch with people they care about. Write like a real person texting a " +
      "friend or contact — specific, brief (1-3 sentences), referencing shared context. Match the tone to the relationship.",
    messages: [
      {
        role: "user",
        content: `Today is ${today()}. Suggest a reconnect message.\n\nContact:\n${JSON.stringify(compactContact(contact, interactions))}\n\nRelationship categories: ${CATEGORIES.map((c) => c.label).join(", ")}.`,
      },
    ],
  });
  if (!response.parsed_output) throw new Error("Could not draft a message");
  return response.parsed_output;
}
