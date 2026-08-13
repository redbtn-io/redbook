import "server-only";

import { getConfig } from "@/lib/config";
import { logInfo } from "@/lib/logging";
import type { Principal } from "@/lib/session";
import {
  countClients,
  createClient,
  createContact,
  createInteraction,
  createNote,
} from "@/lib/repository";
import type { ClientInput, ContactInput, InteractionInput, NoteInput } from "@/lib/crm";

/**
 * Preliminary data so a new user's book opens with something real-looking
 * rather than an empty state.
 *
 * FinThrive is a real company — US healthcare revenue-cycle management SaaS,
 * Plano TX, formed out of the nThrive/TriZetto Provider Solutions lineage —
 * and here it is a CLIENT in the book: the account being worked. Everything
 * attached to it (people, numbers, conversations) is ILLUSTRATIVE placeholder
 * content, not real FinThrive data, and it is ordinary editable CRM rows.
 *
 * Idempotent by construction: it runs only when the user has zero clients, so
 * editing or deleting a seeded record never resurrects it.
 */

function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(15, 0, 0, 0);
  return date.toISOString();
}

function daysAhead(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

interface SeedRecord {
  client: ClientInput;
  contacts: ContactInput[];
  notes: NoteInput[];
  interactions: InteractionInput[];
}

export function seedRecords(): SeedRecord[] {
  return [
    {
      client: {
        name: "FinThrive",
        industry: "Healthcare revenue cycle management (SaaS)",
        website: "https://finthrive.com",
        status: "active",
        owner: "Josh",
        arr: 240_000,
        renewalDate: daysAhead(72),
        tags: ["healthcare", "rcm", "saas", "enterprise"],
        summary:
          "Healthcare revenue-cycle management software vendor headquartered in Plano, TX. Sells patient access, claims management, denials, and revenue-integrity analytics to hospitals and physician groups. Engagement is with their revenue operations and customer success leadership. Strong executive sponsor; the open question is whether the work extends past the current statement of work into their analytics org.",
      },
      contacts: [
        {
          name: "Dana Whitfield",
          title: "SVP Revenue Operations",
          email: "dana.whitfield@example.com",
          phone: "+1 972 555 0142",
          isPrimary: true,
          notes:
            "Economic buyer and the reason this engagement exists. Wants outcome trends, not activity reports. Responds to written follow-ups within a day; slow on calendar invites.",
        },
        {
          name: "Marcus Bell",
          title: "Director, Customer Success",
          email: "marcus.bell@example.com",
          phone: "+1 972 555 0177",
          isPrimary: false,
          notes:
            "Day-to-day counterpart. Owns the CSM team the work actually lands on. Was skeptical early after a rough rollout of a previous initiative — winning him is what makes the expansion possible.",
        },
        {
          name: "Priya Raghavan",
          title: "Director, Product Analytics",
          email: "priya.raghavan@example.com",
          isPrimary: false,
          notes:
            "Gatekeeper for anything touching their data warehouse. Has her own roadmap and a change-control calendar; engage her early or integration work slips a full quarter.",
        },
      ],
      notes: [
        {
          body: "The account is healthy at the top and unproven in the middle. Dana sees the value clearly and repeats the numbers to her own leadership. Marcus, whose team absorbs the operational load, is more measured — his people still run two manual steps that were supposed to be automated in phase one. If the renewal conversation is built only on Dana's enthusiasm, Marcus becomes an objection nobody prepared for. The plan is to close both manual steps before the next review and have Marcus present the before-and-after himself rather than have it presented to him.",
          pinned: true,
        },
        {
          body: "Procurement signalled they would prefer a multi-year structure at renewal in exchange for a committed response-time SLA. Nothing on paper yet and legal has not been engaged. Worth pricing before it is asked for rather than after.",
          pinned: false,
        },
        {
          body: "Expansion thesis: the analytics org under Priya has a genuine gap in denial root-cause reporting, and Marcus's team is manually rebuilding a version of it every month. That overlap is the natural second phase. It needs Priya bought in, not just informed.",
          pinned: false,
        },
      ],
      interactions: [
        {
          type: "meeting",
          subject: "Quarterly business review",
          occurredAt: daysAgo(21),
          participants: ["Dana Whitfield", "Marcus Bell", "Josh"],
          summary:
            "Walked the quarter's outcomes. Dana pleased with the trend line and asked for it in writing for her own leadership review. Marcus surfaced two manual steps still outstanding from phase one; committed to closing both before renewal and to letting Marcus present the result.",
          transcript:
            "Josh: Starting with the number you care about, Dana. The trend is down three points quarter over quarter, and the biggest single contributor is the eligibility check firing before registration completes rather than after.\nDana: That is the number I repeat upstairs, so I want it in writing, not just on a slide.\nJosh: You will have it this week. Marcus, I know the view from your side is more mixed.\nMarcus: It is. My team still runs two manual steps on the secondary path. Every month I hear it is on the roadmap. My people do not experience a three-point improvement, they experience two spreadsheets.\nJosh: That is fair and I am not going to argue with it. Let me commit to something concrete instead. Both steps closed before renewal, and you present the before-and-after at the next review rather than me.\nMarcus: If that actually happens, I will present it.\nDana: I would rather hear it from Marcus than from a vendor deck anyway.",
          followUps: [
            "Send Dana the quarter's trend in writing for her leadership review",
            "Close manual step #1 on the secondary path before renewal",
            "Close manual step #2 on the secondary path before renewal",
            "Confirm Marcus presents the before-and-after at the next QBR",
          ],
        },
        {
          type: "call",
          subject: "Analytics integration scoping",
          occurredAt: daysAgo(9),
          participants: ["Priya Raghavan", "Josh"],
          summary:
            "Priya laid out her change-control calendar. Next integration window is roughly six weeks out; missing it pushes to the following quarter. She wants an interface spec, a test plan, and a named engineer rather than a support queue.",
          transcript:
            "Priya: I want to be direct about the calendar, because people usually find out too late. My next change window is about six weeks out. If the work is not scoped and through review by then, the next one is a quarter later.\nJosh: Understood. What does scoped mean to you specifically, so I do not guess?\nPriya: Interface spec, test plan, and a named engineer on your side who is awake during our validation window. Not a support queue and not a rota.\nJosh: You will have all three, and I will put a name against it rather than a team.\nPriya: Then we will make the window. I am not being difficult, I am trying to save you a quarter.",
          followUps: [
            "Send interface spec and test plan to Priya this week",
            "Name a dedicated engineer for the validation window",
            "Put the six-week change window on the internal calendar",
          ],
        },
        {
          type: "conversation",
          subject: "Hallway check-in with customer success",
          occurredAt: daysAgo(12),
          participants: ["Marcus Bell", "Josh"],
          summary:
            "Informal. Marcus confirmed the core queue genuinely saves his CSMs time and he would say so publicly. He also flagged that nobody trained his team on the analytics module, which explains the low usage there — a training gap, not a product rejection.",
          transcript:
            "Marcus: Honestly the queue is the only reason my team is not drowning right now. I would say that to anyone who asked.\nJosh: Would you say it to Dana?\nMarcus: Sure. She has never asked me, which is the odd part.\nJosh: What about the analytics side? Usage there fell off a cliff and I have been assuming people did not like it.\nMarcus: Nobody ever trained us on it. When the original project lead moved teams, the knowledge went with her. We are not avoiding it, we genuinely do not know how to drive it.",
          followUps: [
            "Schedule analytics training for Marcus's team",
            "Ask Dana to bring Marcus into the renewal conversation directly",
          ],
        },
        {
          type: "email",
          subject: "Renewal structure question from procurement",
          occurredAt: daysAgo(4),
          participants: ["Dana Whitfield", "Josh"],
          summary:
            "Procurement asked whether a multi-year term with a committed response-time SLA is available. Reads as intent to renew long, but commits us to something not yet priced.",
          followUps: [
            "Price a multi-year term with a committed response-time SLA",
            "Check what response-time commitment is actually operationally safe",
          ],
        },
      ],
    },
  ];
}

/**
 * Populate a brand-new user's book with starter data. No-op once they have
 * any client at all, so this is safe to call on every request.
 */
export async function ensureSeeded(principal: Principal): Promise<boolean> {
  if (!getConfig().autoSeed) return false;

  const existing = await countClients(principal);
  if (existing > 0) return false;

  const records = seedRecords();
  for (const record of records) {
    const client = await createClient(principal, record.client);
    for (const contact of record.contacts) {
      await createContact(principal, client.id, contact);
    }
    for (const note of record.notes) {
      await createNote(principal, client.id, note);
    }
    for (const interaction of record.interactions) {
      await createInteraction(principal, client.id, interaction);
    }
  }

  logInfo("Seeded starter CRM data", { userId: principal.userId, clients: records.length });
  return true;
}
