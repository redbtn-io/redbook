import "server-only";

import { getConfig } from "@/lib/config";
import { logInfo } from "@/lib/logging";
import type { OrgMembership } from "@/lib/authz";
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
 * Preliminary data so a new org's book opens with something real-looking
 * rather than an empty state.
 *
 * FinThrive is the ORG — Josh's employer, a real US healthcare revenue-cycle
 * management SaaS company (Plano, TX). It is not a client. The clients below
 * are the kind of accounts a FinThrive rep would actually carry: healthcare
 * PROVIDERS buying revenue-cycle software. All of them are invented, with
 * `example.com` contact details, and are ordinary editable CRM rows.
 *
 * Idempotent by construction: it runs only when the org has zero clients, so
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
        name: "Meridian Health Partners",
        industry: "Integrated delivery network",
        website: "https://example.com/meridian-health",
        status: "active",
        owner: "Josh",
        arr: 1_450_000,
        renewalDate: daysAhead(84),
        tags: ["enterprise", "rcm", "epic"],
        summary:
          "Nine-hospital integrated delivery network in the upper Midwest. Bought the full revenue-cycle suite after an eleven-month evaluation. Epic shop, so every integration conversation routes through their HIM director. Strong sponsor in the CFO, weaker adoption at the patient-financial-services level — that gap is the renewal risk, not the product.",
      },
      contacts: [
        {
          name: "Dana Whitfield",
          title: "Chief Financial Officer",
          email: "dana.whitfield@example.com",
          phone: "+1 612 555 0142",
          isPrimary: true,
          notes:
            "Economic buyer and the reason the deal closed. Wants denial-rate trend in every review, not activity metrics. Replies to written follow-ups within a day; slow on calendar invites.",
        },
        {
          name: "Marcus Bell",
          title: "Director, Patient Financial Services",
          email: "marcus.bell@example.com",
          phone: "+1 612 555 0177",
          isPrimary: false,
          notes:
            "Day-to-day owner. Skeptical after a rough go-live and still running two manual workarounds. Win him and the renewal is safe.",
        },
        {
          name: "Priya Raghavan",
          title: "HIM Director",
          email: "priya.raghavan@example.com",
          isPrimary: false,
          notes: "Gatekeeper for anything touching Epic. Book her early or integration work slips a quarter.",
        },
      ],
      notes: [
        {
          body: "Renewal is roughly a quarter out and this account is a tale of two levels. Dana sees clean denial-rate improvement and quotes it to her board. Marcus does not: his team absorbed a messy go-live and still runs two manual workarounds for secondary claims. If we walk into the renewal with only the CFO story, Marcus becomes the objection nobody prepared for. Plan is to close both workarounds before the review and let Marcus present the improvement himself.",
          pinned: true,
        },
        {
          body: "Procurement confirmed they want a three-year structure this time rather than annual, contingent on a committed uptime SLA. Legal has not seen paper yet. Worth pricing before it is asked for.",
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
            "Reviewed denial-rate trend (down 3.1 points year over year) and cash acceleration. Dana pleased and wants it in writing for her board. Marcus raised the two open manual workarounds; committed to closing both before renewal and to letting him present the result.",
          transcript:
            "Josh: Starting with the number you care about, Dana. Initial denial rate is down 3.1 points year over year, and the biggest single contributor is the eligibility check firing before registration completes.\nDana: That is the number I quote to the board, so I want it in writing, not just on a slide.\nJosh: You will have it this week. Marcus, I know the picture on your side is more mixed.\nMarcus: It is. My team still runs two manual workarounds on secondary claims. Every month I hear it is on the roadmap. My people do not experience a three-point denial improvement, they experience two spreadsheets.\nJosh: That is fair, and I am not going to argue with it. Let me commit to something concrete instead. Both workarounds closed before the renewal date, and you present the before-and-after at the next review rather than me.\nMarcus: If that actually happens, I will present it.\nDana: I would rather hear it from Marcus than from a vendor deck anyway.",
          followUps: [
            "Send Dana the denial-rate trend in writing for her board deck",
            "Close secondary-claims workaround #1 before renewal",
            "Close secondary-claims workaround #2 before renewal",
          ],
        },
        {
          type: "call",
          subject: "Epic integration scoping with HIM",
          occurredAt: daysAgo(9),
          participants: ["Priya Raghavan", "Josh"],
          summary:
            "Priya walked through her Epic change-control calendar. Next integration window is six weeks out; missing it waits a full quarter. She wants an interface spec, a test plan, and a named engineer rather than a support queue.",
          transcript:
            "Priya: I want to be direct about the calendar, because people usually find out too late. My next change window is in six weeks. If your work is not fully scoped and through review by then, the next one is a quarter out.\nJosh: Understood. What does fully scoped mean to you specifically, so I do not guess?\nPriya: Interface spec, test plan, and a named engineer on your side who will be awake during our validation window. Not a support queue.\nJosh: You will have all three, and I will put a name against it rather than a team.\nPriya: Then we will make the window. I am not trying to be difficult, I am trying to save you a quarter.",
          followUps: [
            "Send interface spec and test plan to Priya this week",
            "Name a dedicated engineer for the Epic validation window",
          ],
        },
      ],
    },
    {
      client: {
        name: "Cascade Physician Group",
        industry: "Multi-specialty physician group",
        website: "https://example.com/cascade-physicians",
        status: "at_risk",
        owner: "Josh",
        arr: 320_000,
        renewalDate: daysAhead(38),
        tags: ["mid-market", "at-risk", "denials"],
        summary:
          "180-provider multi-specialty group in the Pacific Northwest. Bought denials management only. The champion who built the business case left four months ago and the replacement inherited the contract with no context. Usage is down and the renewal is genuinely in question.",
      },
      contacts: [
        {
          name: "Alina Duarte",
          title: "VP Revenue Cycle",
          email: "alina.duarte@example.com",
          phone: "+1 503 555 0119",
          isPrimary: true,
          notes:
            "Inherited the contract and has never seen the original business case. Neutral to negative. Needs to be sold from scratch, on her own numbers.",
        },
        {
          name: "Ron Petrakis",
          title: "Practice Administrator",
          email: "ron.petrakis@example.com",
          isPrimary: false,
          notes: "Uses the product daily and likes it. Best internal advocate available, but has no budget authority.",
        },
      ],
      notes: [
        {
          body: "This is a churn risk driven by a people change, not a product failure. The original champion built the business case, left, and took the context with her. Alina has never seen the numbers that justified the purchase. Ron still uses the tool every day and is positive about it but controls no budget. The play is to rebuild the business case from Ron's actual usage data and hand it to Alina as her own win rather than as a vendor save.",
          pinned: true,
        },
        {
          body: "Login volume is down roughly 40 percent since the champion departed, concentrated in the analytics module. Core denials queue usage is steady, which is the encouraging part.",
          pinned: false,
        },
      ],
      interactions: [
        {
          type: "call",
          subject: "Introductory call with new VP",
          occurredAt: daysAgo(26),
          participants: ["Alina Duarte", "Josh"],
          summary:
            "First real conversation with Alina. Candid that she is reviewing every inherited vendor contract and has no attachment to this one. Asked directly what the measurable return has been.",
          transcript:
            "Alina: I will be straightforward with you. I inherited a stack of contracts and I am reviewing all of them. I have no history with your product and no attachment to it.\nJosh: That is a reasonable position, and I would rather have it stated than implied. What would make it worth keeping, in your terms?\nAlina: A number. What has it actually returned? Not what it could return.\nJosh: I do not want to invent one on this call. Give me two weeks and I will bring you your own data, not a case study.\nAlina: That is the right answer. If the number is not there, I would rather you tell me that too.",
          followUps: [
            "Rebuild the ROI case from Cascade's own usage data",
            "Check whether the original business case document still exists internally",
          ],
        },
        {
          type: "conversation",
          subject: "Hallway check-in with practice administrator",
          occurredAt: daysAgo(12),
          participants: ["Ron Petrakis", "Josh"],
          summary:
            "Informal. Ron confirmed the denials queue genuinely saves his billers time and offered to say so to Alina. Flagged that nobody trained his team on analytics, which explains the usage drop — a training gap, not a rejection.",
          transcript:
            "Ron: Honestly the queue is the only reason my billers are not drowning. I would say that to anyone.\nJosh: Would you say it to Alina?\nRon: Sure. She has never asked me. That is the odd part.\nJosh: What about the analytics side? Usage there fell off a cliff and I assumed people disliked it.\nRon: Nobody ever trained us on it. When Karen left, the knowledge left. We are not avoiding it, we just do not know how to use it.",
          followUps: [
            "Schedule analytics training for Ron's team",
            "Ask Ron to join the renewal conversation with Alina",
          ],
        },
      ],
    },
    {
      client: {
        name: "St. Aubin Regional Medical Center",
        industry: "Community hospital",
        website: "https://example.com/st-aubin",
        status: "prospect",
        owner: "Josh",
        arr: 0,
        tags: ["prospect", "rfp", "community-hospital"],
        summary:
          "310-bed community hospital running an aging in-house revenue-cycle process. Formal RFP expected next quarter and two competitors are already in the building. Our differentiator is denials analytics depth; our weakness is having no reference of their size in their state.",
      },
      contacts: [
        {
          name: "Grace Okonkwo",
          title: "VP Finance",
          email: "grace.okonkwo@example.com",
          phone: "+1 314 555 0165",
          isPrimary: true,
          notes: "Runs the evaluation. Analytical, and has said plainly that peer references outrank everything else.",
        },
        {
          name: "Tom Reilly",
          title: "Revenue Cycle Manager",
          email: "tom.reilly@example.com",
          isPrimary: false,
          notes: "Will do the hands-on evaluation. Frustrated with the current manual process — a natural ally.",
        },
      ],
      notes: [
        {
          body: "The RFP has not dropped yet, which is exactly when this is winnable. Grace's stated criterion is peer references at her size in her state, and that is precisely what we lack. Rather than pretend otherwise, the plan is to offer the closest adjacent references and be upfront about the difference, while getting Tom deep enough into a hands-on evaluation that he becomes the internal advocate. Competing on references alone is a losing frame for us; competing on the analytics Tom will actually touch is not.",
          pinned: true,
        },
      ],
      interactions: [
        {
          type: "meeting",
          subject: "Discovery session",
          occurredAt: daysAgo(17),
          participants: ["Grace Okonkwo", "Tom Reilly", "Josh"],
          summary:
            "Mapped their current process: heavily manual, three FTEs on work that should be automated. Grace stated peer references are her primary criterion. Tom lit up during the denials analytics walkthrough — he rebuilds that view by hand every month.",
          transcript:
            "Grace: I will tell you my main criterion up front so you do not waste effort. I want references from hospitals my size, in my state. That is what my board will ask.\nJosh: Then let me be honest rather than clever. I do not have one in your state at your size. I have two close on size and one close on geography, and I will put you in touch with all three, including the one that had a rocky implementation.\nGrace: You are volunteering the rocky one?\nJosh: You will find it anyway. I would rather you hear it from me with the context.\nTom: Can we go back to the denials view for a second? The one that groups by payer and root cause. We build that by hand every month. It takes me three days.\nJosh: That view is standard and it updates continuously.\nTom: Three days a month. Grace, that is thirty-six days a year.",
          followUps: [
            "Line up three references including the difficult implementation",
            "Give Tom sandbox access to the denials analytics module",
            "Track the RFP release date",
          ],
        },
      ],
    },
  ];
}

/**
 * Populate a brand-new org's book with starter data. No-op once the org has
 * any client at all, so this is safe to call on every request.
 */
export async function ensureSeeded(
  membership: OrgMembership,
  principal: Principal,
): Promise<boolean> {
  if (!getConfig().autoSeed) return false;

  const existing = await countClients(membership);
  if (existing > 0) return false;

  const records = seedRecords();
  for (const record of records) {
    const client = await createClient(membership, principal, record.client);
    for (const contact of record.contacts) {
      await createContact(membership, principal, client.id, contact);
    }
    for (const note of record.notes) {
      await createNote(membership, principal, client.id, note);
    }
    for (const interaction of record.interactions) {
      await createInteraction(membership, principal, client.id, interaction);
    }
  }

  logInfo("Seeded starter CRM data", { orgId: membership.orgId, clients: records.length });
  return true;
}
