import "server-only";
import { addInteraction, addReminder, createContact, db } from "./db";
import type { Category, StructuredContext } from "./types";

// Fictional contacts for demo deployments. Loaded only when SEED_SAMPLE_DATA=1
// and the database has no contacts yet. Dates are relative to the moment of seeding.

interface SamplePerson {
  name: string;
  company: string;
  role: string;
  category: Category;
  email?: string;
  phone?: string;
  raw: string;
  context: StructuredContext | null;
  /** [days ago, kind, summary] */
  interactions: [number, string, string][];
  /** Positive days = due in the future, negative = overdue. */
  reminder?: { days: number; note: string };
}

const DAY = 86_400_000;

const PEOPLE: SamplePerson[] = [
  {
    name: "Priya Raman", company: "Kiln Ventures", role: "Partner", category: "professional",
    email: "priya@example.com", phone: "+44 7700 900101",
    raw: "Met Priya at Night School demo day. Partner at a seed fund investing in consumer brands. Loves pottery and Hindi film music.",
    context: {
      summary: "Seed-stage VC partner I met at Night School demo day; invests in consumer brands.",
      metWhere: "Night School demo day, London", metHow: "Came over after my pitch",
      whatTheyDo: "Partner at Kiln Ventures, a seed fund for consumer brands",
      interests: ["pottery", "Hindi film music", "D2C brands"],
      collaboration: ["Could intro me to jewellery founders", "I could help her portfolio with growth marketing"],
      tags: ["venture capital", "seed", "consumer brands", "night school", "london"],
    },
    interactions: [[40, "met", "Met at Night School demo day"], [12, "email", "Sent her our deck; she asked for retention numbers"]],
    reminder: { days: 3, note: "Send retention numbers" },
  },
  {
    name: "Tom Okafor", company: "Northbeam Capital", role: "Associate", category: "professional",
    email: "tom@example.com",
    raw: "Tom is an associate at Northbeam, a Series A fund. Met him at a fintech breakfast.",
    context: {
      summary: "Series A associate at Northbeam Capital, met at a fintech breakfast.",
      metWhere: "Fintech breakfast, Shoreditch", metHow: "",
      whatTheyDo: "Associate at Northbeam Capital (Series A, fintech and marketplaces)",
      interests: ["fintech", "running", "chess"],
      collaboration: ["Warm path to Series A conversations later"],
      tags: ["venture capital", "series a", "fintech", "london"],
    },
    interactions: [[150, "met", "Breakfast chat about marketplace take rates"]],
  },
  {
    name: "Aisha Khan", company: "Gild & Grain", role: "Founder", category: "friend",
    phone: "+44 7700 900102",
    raw: "Aisha makes hand-finished gold rings and runs Gild & Grain. Old uni friend.",
    context: {
      summary: "Uni friend who runs Gild & Grain, a fine-jewellery studio.",
      metWhere: "University, Manchester", metHow: "Same halls in first year",
      whatTheyDo: "Founder of Gild & Grain; designs and makes hand-finished gold rings",
      interests: ["jewellery design", "ceramics", "climbing"],
      collaboration: ["Could advise on sourcing for a jewellery pop-up", "I could help with her Shopify ads"],
      tags: ["jewellery", "rings", "founder", "manchester", "design"],
    },
    interactions: [[200, "call", "Caught up about her new studio space"]],
  },
  {
    name: "Leo Martins", company: "", role: "Silversmith", category: "acquaintance",
    raw: "Leo is a silversmith who sells at Spitalfields market. Met him at Night School's maker evening.",
    context: {
      summary: "Silversmith selling at Spitalfields; met at Night School's maker evening.",
      metWhere: "Night School maker evening", metHow: "",
      whatTheyDo: "Independent silversmith, sells at Spitalfields market",
      interests: ["silversmithing", "markets", "vintage cameras"],
      collaboration: ["Possible pop-up collaboration"],
      tags: ["jewellery", "silver", "maker", "night school", "markets"],
    },
    interactions: [[25, "met", "Swapped numbers at the maker evening"]],
    reminder: { days: -2, note: "Ask about stall prices at Spitalfields" },
  },
  {
    name: "Sofia Rossi", company: "Brightwave", role: "Head of Growth", category: "professional",
    email: "sofia@example.com",
    raw: "Sofia runs growth at Brightwave. Great at paid social. Met through Priya.",
    context: {
      summary: "Head of Growth at Brightwave, introduced by Priya.",
      metWhere: "", metHow: "Intro from Priya Raman",
      whatTheyDo: "Head of Growth at Brightwave (consumer subscription app)",
      interests: ["paid social", "pilates", "Italian cooking"],
      collaboration: ["Swap notes on paid social benchmarks"],
      tags: ["growth", "marketing", "paid social", "subscription"],
    },
    interactions: [[8, "call", "30-min call on TikTok ad creative"]],
  },
  {
    name: "Daniel Cho", company: "Lumen Labs", role: "CTO", category: "close_friend",
    phone: "+44 7700 900103",
    raw: "Dan is one of my closest friends, CTO at Lumen Labs. We play five-a-side on Thursdays.",
    context: {
      summary: "Close friend, CTO at Lumen Labs; five-a-side on Thursdays.",
      metWhere: "School", metHow: "",
      whatTheyDo: "CTO at Lumen Labs (computer vision)",
      interests: ["football", "board games", "computer vision"],
      collaboration: ["Sounding board for technical hiring"],
      tags: ["engineering", "cto", "computer vision", "football"],
    },
    interactions: [[3, "met", "Five-a-side, then dinner"]],
  },
  {
    name: "Hannah Weiss", company: "Studio Weiss", role: "Brand designer", category: "friend",
    raw: "Hannah is a freelance brand designer. Did our first logo.",
    context: {
      summary: "Freelance brand designer who made our first logo.",
      metWhere: "Co-working space, Hackney", metHow: "",
      whatTheyDo: "Runs Studio Weiss, a one-person brand design studio",
      interests: ["typography", "risograph printing", "cycling"],
      collaboration: ["Packaging design for a jewellery line"],
      tags: ["design", "branding", "freelance", "packaging"],
    },
    interactions: [[320, "met", "Wrapped up the logo project"]],
  },
  {
    name: "Marcus Bell", company: "Night School", role: "Programme lead", category: "professional",
    email: "marcus@example.com",
    raw: "Marcus runs the Night School founder programme.",
    context: {
      summary: "Runs the Night School founder programme.",
      metWhere: "Night School", metHow: "Applied to the programme",
      whatTheyDo: "Programme lead at Night School",
      interests: ["community building", "jazz"],
      collaboration: ["Could help me get a demo day slot next cohort"],
      tags: ["night school", "accelerator", "community", "london"],
    },
    interactions: [[60, "email", "Thanked him for the demo day slot"]],
    reminder: { days: 14, note: "Ask about mentoring the next cohort" },
  },
  {
    name: "Grace Adeyemi", company: "Hale & Co", role: "Lawyer", category: "acquaintance",
    raw: "Grace is a startup lawyer at Hale & Co, met at a friend's wedding.",
    context: {
      summary: "Startup lawyer at Hale & Co; met at a friend's wedding.",
      metWhere: "Friend's wedding, Bristol", metHow: "",
      whatTheyDo: "Corporate lawyer at Hale & Co, focused on startup fundraising",
      interests: ["salsa", "travel"],
      collaboration: ["Could review a SAFE before we raise"],
      tags: ["legal", "fundraising", "startups", "bristol"],
    },
    interactions: [[240, "met", "Chatted about SAFEs at the wedding"]],
  },
  {
    name: "Ravi Menon", company: "", role: "", category: "close_friend",
    phone: "+91 98450 00104",
    raw: "Ravi, cousin in Bangalore. Getting married in March.",
    context: {
      summary: "Cousin in Bangalore, getting married in March.",
      metWhere: "", metHow: "Family",
      whatTheyDo: "Product manager at a Bangalore fintech",
      interests: ["cricket", "biryani", "photography"],
      collaboration: [],
      tags: ["family", "bangalore", "india"],
    },
    interactions: [[95, "call", "Video call about wedding plans"]],
  },
  {
    name: "Emily Park", company: "Fable Books", role: "Editor", category: "friend",
    raw: "Emily is an editor at Fable Books. Book club friend.",
    context: {
      summary: "Book club friend, editor at Fable Books.",
      metWhere: "Book club", metHow: "",
      whatTheyDo: "Non-fiction editor at Fable Books",
      interests: ["reading", "wild swimming"],
      collaboration: ["Advice on writing a founder newsletter"],
      tags: ["publishing", "books", "writing"],
    },
    interactions: [[18, "met", "Book club at hers"]],
  },
  {
    name: "Oliver Grant", company: "", role: "", category: "acquaintance",
    raw: "Oliver, met on a flight to Lisbon. Into surfing.",
    context: null,
    interactions: [],
  },
];

export function seedSampleDataIfEmpty(): void {
  const { n } = db().prepare("SELECT COUNT(*) AS n FROM contacts").get() as { n: number };
  if (n > 0) return;
  for (const p of PEOPLE) {
    const contact = createContact({
      name: p.name,
      phone: p.phone ?? "",
      email: p.email ?? "",
      company: p.company,
      role: p.role,
      category: p.category,
      rawContext: p.raw,
      context: p.context,
      notes: "",
    });
    for (const [days, kind, summary] of p.interactions) {
      addInteraction(contact.id, new Date(Date.now() - days * DAY).toISOString(), kind, summary);
    }
    if (p.reminder) {
      const due = new Date(Date.now() + p.reminder.days * DAY);
      if (p.reminder.days > 0) due.setHours(9, 0, 0, 0);
      addReminder(contact.id, due.toISOString(), p.reminder.note);
    }
  }
}
