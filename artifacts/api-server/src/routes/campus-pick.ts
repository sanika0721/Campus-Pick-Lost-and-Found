import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  CreateClaimBody,
  CreateItemBody,
  GetItemParams,
  ListItemsQueryParams,
  UpdateClaimBody,
  UpdateClaimParams,
  VerifyHandoverBody,
  VerifyHandoverParams,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  claimsTable,
  handoversTable,
  itemsTable,
  matchesTable,
  messagesTable,
  notificationsTable,
  savedItemsTable,
  usersTable,
} from "@workspace/db";
import { ensureCampusPickSeeded } from "../lib/campus-pick-seed";

const router: IRouter = Router();
const DEMO_USER_ID = 1;
const DEMO_USER_NAME = "Maya Patel";

const toIso = (value: Date | string | null | undefined) =>
  value instanceof Date ? value.toISOString() : value ?? null;

function labelForScore(score: number) {
  if (score >= 85) return "Very High Match";
  if (score >= 70) return "High Match";
  if (score >= 50) return "Possible Match";
  return "Low Match";
}

function scoreItems(a: typeof itemsTable.$inferSelect, b: typeof itemsTable.$inferSelect) {
  let score = 0;
  const reason: string[] = [];
  if (a.category.toLowerCase() === b.category.toLowerCase()) {
    score += 25;
    reason.push("same category");
  }
  if (a.color && b.color && a.color.toLowerCase() === b.color.toLowerCase()) {
    score += 18;
    reason.push("same color");
  }
  if (a.brand && b.brand && a.brand.toLowerCase() === b.brand.toLowerCase()) {
    score += 18;
    reason.push("same brand");
  }
  if (a.location.toLowerCase() === b.location.toLowerCase()) {
    score += 18;
    reason.push("same campus location");
  }
  if (a.eventDate === b.eventDate) {
    score += 12;
    reason.push("same date");
  }
  const words = `${a.itemName} ${a.description} ${a.identifyingFeatures ?? ""}`
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length > 3);
  const otherText = `${b.itemName} ${b.description}`.toLowerCase();
  const overlap = new Set(words.filter((word) => otherText.includes(word)));
  if (overlap.size > 0) {
    score += Math.min(9, overlap.size * 3);
    reason.push("matching keywords");
  }
  return { score: Math.min(score, 99), reason: reason.join(", ") || "limited shared details" };
}

async function itemView(item: typeof itemsTable.$inferSelect) {
  const [saved] = await db
    .select({ id: savedItemsTable.id })
    .from(savedItemsTable)
    .where(and(eq(savedItemsTable.itemId, item.id), eq(savedItemsTable.userId, DEMO_USER_ID)))
    .limit(1);
  const [match] = await db
    .select({ score: matchesTable.score, label: matchesTable.label })
    .from(matchesTable)
    .where(eq(matchesTable.itemId, item.id))
    .orderBy(desc(matchesTable.score))
    .limit(1);
  return {
    id: item.id,
    reportId: item.reportId,
    type: item.type as "lost" | "found",
    itemName: item.itemName,
    category: item.category,
    description: item.description,
    brand: item.brand,
    model: item.model,
    color: item.color,
    location: item.location,
    eventDate: item.eventDate,
    approximateTime: item.approximateTime,
    condition: item.condition,
    status: item.status,
    imageUrl: item.imageUrl,
    identifyingFeatures: item.identifyingFeatures,
    storageStatus: item.storageStatus,
    submittedBy: item.submittedBy,
    createdAt: toIso(item.createdAt),
    isSaved: Boolean(saved),
    matchScore: match?.score ?? null,
    matchLabel: match?.label ?? null,
  };
}

async function notify(title: string, message: string, type: string, href: string, userId?: number) {
  await db.insert(notificationsTable).values({ userId, title, message, type, href });
}

router.get("/dashboard", async (_req, res) => {
  await ensureCampusPickSeeded();
  const items = await db.select().from(itemsTable).orderBy(desc(itemsTable.createdAt));
  const claims = await db.select().from(claimsTable);
  const matchCount = await db.select({ count: sql<number>`count(*)::int` }).from(matchesTable);
  const returned = items.filter((item) => item.status === "returned").length;
  const recentItems = await Promise.all(items.slice(0, 4).map(itemView));
  return res.json({
    userName: DEMO_USER_NAME,
    role: "student",
    stats: {
      myReports: items.filter((item) => item.submittedBy === DEMO_USER_NAME).length,
      potentialMatches: matchCount[0]?.count ?? 0,
      activeClaims: claims.filter((claim) => !["rejected", "approved"].includes(claim.status)).length,
      returnedItems: returned,
    },
    recentItems,
    recentActivity: [
      {
        id: 1,
        title: "Potential match identified",
        description: "A found laptop shares five details with your lost report.",
        time: "12 min ago",
        type: "match",
      },
      {
        id: 2,
        title: "Campus Safety updated storage",
        description: "Found items are secured at the Main Gate desk.",
        time: "Yesterday",
        type: "security",
      },
      {
        id: 3,
        title: "New report near Library",
        description: "A brass keyring was reported this morning.",
        time: "2 days ago",
        type: "report",
      },
    ],
  });
});

router.get("/items", async (req, res) => {
  await ensureCampusPickSeeded();
  const query = ListItemsQueryParams.parse(req.query);
  const rows = await db.select().from(itemsTable).orderBy(desc(itemsTable.createdAt));
  const filtered = rows.filter((item) => {
    const haystack = `${item.itemName} ${item.description} ${item.brand ?? ""} ${item.model ?? ""}`.toLowerCase();
    if (query.type && query.type !== "all" && item.type !== query.type) return false;
    if (query.category && item.category !== query.category) return false;
    if (query.location && item.location !== query.location) return false;
    if (query.color && item.color !== query.color) return false;
    if (query.brand && item.brand !== query.brand) return false;
    if (query.status && item.status !== query.status) return false;
    if (query.q && !haystack.includes(query.q.toLowerCase())) return false;
    return true;
  });
  const items = await Promise.all(filtered.map(itemView));
  if (query.sort === "relevance" && query.q) {
    items.sort((a, b) => Number(b.itemName.toLowerCase().includes(query.q!.toLowerCase())) - Number(a.itemName.toLowerCase().includes(query.q!.toLowerCase())));
  }
  res.json({ items, total: items.length });
});

router.post("/items", async (req, res) => {
  await ensureCampusPickSeeded();
  const input = CreateItemBody.parse(req.body);
  const countResult = await db.select({ count: sql<number>`count(*)::int` }).from(itemsTable);
  const prefix = input.type === "lost" ? "LOST" : "FOUND";
  const reportId = `${prefix}-2026-${String(124 + (countResult[0]?.count ?? 0)).padStart(6, "0")}`;
  const [created] = await db
    .insert(itemsTable)
    .values({
      ...input,
      reportId,
      status: input.type,
      submittedBy: DEMO_USER_NAME,
    })
    .returning();
  const opposite = await db
    .select()
    .from(itemsTable)
    .where(eq(itemsTable.type, input.type === "lost" ? "found" : "lost"));
  for (const candidate of opposite) {
    const scored = scoreItems(created, candidate);
    if (scored.score >= 50) {
      await db.insert(matchesTable).values({
        itemId: input.type === "lost" ? created.id : candidate.id,
        matchedItemId: input.type === "lost" ? candidate.id : created.id,
        score: scored.score,
        label: labelForScore(scored.score),
        reason: scored.reason,
      });
    }
  }
  await notify("Report submitted", `${reportId} is now visible to the campus community.`, "report", "/find", DEMO_USER_ID);
  res.status(201).json(await itemView(created));
});

router.get("/items/:id", async (req, res) => {
  await ensureCampusPickSeeded();
  const { id } = GetItemParams.parse(req.params);
  const [item] = await db.select().from(itemsTable).where(eq(itemsTable.id, id)).limit(1);
  if (!item) return res.status(404).json({ error: "Item not found" });
  const matches = await db.select().from(matchesTable).where(eq(matchesTable.itemId, id));
  const mappedMatches = await Promise.all(
    matches.map(async (match) => {
      const [matched] = await db.select().from(itemsTable).where(eq(itemsTable.id, match.matchedItemId)).limit(1);
      return {
        id: match.id,
        itemId: match.itemId,
        matchedItemId: match.matchedItemId,
        itemName: item.itemName,
        matchedItemName: matched?.itemName ?? "Campus report",
        location: matched?.location ?? item.location,
        score: match.score,
        label: match.label,
        reason: match.reason,
        status: match.status,
      };
    }),
  );
  return res.json({
    ...(await itemView(item)),
    matches: mappedMatches,
    timeline: [
      { label: "Report created", status: "reported", date: toIso(item.createdAt), completed: true },
      { label: "Potential match", status: "matched", date: toIso(item.createdAt), completed: mappedMatches.length > 0 },
      { label: "Claim verification", status: "under_verification", date: "", completed: item.status === "verified" || item.status === "returned" },
      { label: "Returned", status: "returned", date: "", completed: item.status === "returned" },
    ],
  });
});

router.post("/items/:id/save", async (req, res) => {
  await ensureCampusPickSeeded();
  const { id } = GetItemParams.parse(req.params);
  const [saved] = await db
    .select()
    .from(savedItemsTable)
    .where(and(eq(savedItemsTable.itemId, id), eq(savedItemsTable.userId, DEMO_USER_ID)))
    .limit(1);
  if (saved) {
    await db.delete(savedItemsTable).where(eq(savedItemsTable.id, saved.id));
    return res.json({ itemId: id, saved: false });
  }
  await db.insert(savedItemsTable).values({ itemId: id, userId: DEMO_USER_ID });
  return res.json({ itemId: id, saved: true });
});

router.get("/matches", async (_req, res) => {
  await ensureCampusPickSeeded();
  const rows = await db.select().from(matchesTable).orderBy(desc(matchesTable.score));
  const result = await Promise.all(
    rows.map(async (match) => {
      const [item] = await db.select().from(itemsTable).where(eq(itemsTable.id, match.itemId)).limit(1);
      const [matched] = await db.select().from(itemsTable).where(eq(itemsTable.id, match.matchedItemId)).limit(1);
      return {
        id: match.id,
        itemId: match.itemId,
        matchedItemId: match.matchedItemId,
        itemName: item?.itemName ?? "Report",
        matchedItemName: matched?.itemName ?? "Potential match",
        location: matched?.location ?? "Campus",
        score: match.score,
        label: match.label,
        reason: match.reason,
        status: match.status,
      };
    }),
  );
  res.json(result);
});

router.get("/claims", async (_req, res) => {
  await ensureCampusPickSeeded();
  const rows = await db.select().from(claimsTable).orderBy(desc(claimsTable.submittedAt));
  const result = await Promise.all(rows.map(async (claim) => {
    const [item] = await db.select().from(itemsTable).where(eq(itemsTable.id, claim.itemId)).limit(1);
    return {
      id: claim.id,
      itemId: claim.itemId,
      itemName: item?.itemName ?? "Campus item",
      reportId: item?.reportId ?? "REPORT",
      claimantName: claim.claimantName,
      submittedAt: toIso(claim.submittedAt),
      status: claim.status,
      confidence: claim.confidence,
      handoverDate: toIso(claim.handoverDate),
      officer: claim.officer,
    };
  }));
  res.json(result);
});

router.post("/claims", async (req, res) => {
  await ensureCampusPickSeeded();
  const input = CreateClaimBody.parse(req.body);
  const [item] = await db.select().from(itemsTable).where(eq(itemsTable.id, input.itemId)).limit(1);
  if (!item) return res.status(404).json({ error: "Item not found" });
  const protectedText = `${item.identifyingFeatures ?? ""} ${item.description}`.toLowerCase();
  const claimText = `${input.uniqueMarks} ${input.additionalDetails}`.toLowerCase();
  const tokens = claimText.split(/\W+/).filter((token) => token.length > 3);
  const overlap = tokens.filter((token) => protectedText.includes(token)).length;
  const confidence = Math.min(96, 45 + overlap * 17);
  const [created] = await db.insert(claimsTable).values({
    claimantName: DEMO_USER_NAME,
    ...input,
    itemId: item.id,
    confidence,
  }).returning();
  await notify("Claim submitted", `Your claim for ${item.itemName} is under review.`, "claim", "/claims", DEMO_USER_ID);
  return res.status(201).json({
    id: created.id,
    itemId: created.itemId,
    itemName: item.itemName,
    reportId: item.reportId,
    claimantName: created.claimantName,
    submittedAt: toIso(created.submittedAt),
    status: created.status,
    confidence: created.confidence,
    handoverDate: null,
    officer: null,
  });
});

router.patch("/claims/:id", async (req, res) => {
  await ensureCampusPickSeeded();
  const { id } = UpdateClaimParams.parse(req.params);
  const input = UpdateClaimBody.parse(req.body);
  const [claim] = await db.update(claimsTable).set({
    status: input.status,
    handoverDate: input.handoverDate ? new Date(input.handoverDate) : undefined,
    officer: "Arjun Mehta",
  }).where(eq(claimsTable.id, id)).returning();
  if (!claim) return res.status(404).json({ error: "Claim not found" });
  const [item] = await db.select().from(itemsTable).where(eq(itemsTable.id, claim.itemId)).limit(1);
  if (input.status === "approved") {
    await db.update(itemsTable).set({ status: "verified" }).where(eq(itemsTable.id, claim.itemId));
    const code = "4812";
    await db.insert(handoversTable).values({
      claimId: claim.id,
      itemName: item?.itemName ?? "Campus item",
      scheduledFor: new Date(Date.now() + 86400000),
      location: "Main Gate Security Desk",
      codeHash: createHash("sha256").update(code).digest("hex"),
      codeHint: "••12",
    });
  }
  await notify(`Claim ${input.status.replace("_", " ")}`, `Security updated the claim for ${item?.itemName ?? "your item"}.`, "claim", "/claims", DEMO_USER_ID);
  return res.json({
    id: claim.id,
    itemId: claim.itemId,
    itemName: item?.itemName ?? "Campus item",
    reportId: item?.reportId ?? "REPORT",
    claimantName: claim.claimantName,
    submittedAt: toIso(claim.submittedAt),
    status: claim.status,
    confidence: claim.confidence,
    handoverDate: toIso(claim.handoverDate),
    officer: claim.officer,
  });
});

router.get("/notifications", async (_req, res) => {
  await ensureCampusPickSeeded();
  const rows = await db.select().from(notificationsTable).orderBy(desc(notificationsTable.createdAt));
  res.json(rows.map((notification) => ({
    id: notification.id,
    title: notification.title,
    message: notification.message,
    type: notification.type,
    createdAt: toIso(notification.createdAt),
    isRead: notification.isRead,
    href: notification.href,
  })));
});

router.post("/notifications/:id/read", async (req, res) => {
  await ensureCampusPickSeeded();
  const id = Number(req.params.id);
  const [notification] = await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.id, id)).returning();
  if (!notification) return res.status(404).json({ error: "Notification not found" });
  return res.json({
    id: notification.id,
    title: notification.title,
    message: notification.message,
    type: notification.type,
    createdAt: toIso(notification.createdAt),
    isRead: notification.isRead,
    href: notification.href,
  });
});

router.get("/messages", async (_req, res) => {
  await ensureCampusPickSeeded();
  const rows = await db.select().from(messagesTable).orderBy(desc(messagesTable.createdAt));
  res.json(rows.map((message) => ({
    id: message.id,
    threadId: message.threadId,
    senderName: message.senderName,
    senderRole: message.senderRole,
    preview: message.body.slice(0, 90),
    body: message.body,
    createdAt: toIso(message.createdAt),
    unread: message.unread,
    itemName: message.itemName,
  })));
});

router.post("/messages", async (req, res) => {
  await ensureCampusPickSeeded();
  const body = String(req.body.body ?? "").trim();
  const threadId = String(req.body.threadId ?? "thread-general");
  if (!body) return res.status(400).json({ error: "Message cannot be empty" });
  const [message] = await db.insert(messagesTable).values({
    threadId,
    senderName: DEMO_USER_NAME,
    senderRole: "Student",
    body,
    unread: false,
  }).returning();
  return res.status(201).json({
    id: message.id,
    threadId: message.threadId,
    senderName: message.senderName,
    senderRole: message.senderRole,
    preview: message.body.slice(0, 90),
    body: message.body,
    createdAt: toIso(message.createdAt),
    unread: message.unread,
    itemName: null,
  });
});

router.get("/security/queue", async (_req, res) => {
  await ensureCampusPickSeeded();
  const claims = await db.select().from(claimsTable).where(sql`${claimsTable.status} in ('pending', 'under_verification', 'manual_review')`).orderBy(desc(claimsTable.submittedAt));
  const pendingClaims = await Promise.all(claims.map(async (claim) => {
    const [item] = await db.select().from(itemsTable).where(eq(itemsTable.id, claim.itemId)).limit(1);
    return {
      id: claim.id,
      itemId: claim.itemId,
      itemName: item?.itemName ?? "Campus item",
      reportId: item?.reportId ?? "REPORT",
      claimantName: claim.claimantName,
      submittedAt: toIso(claim.submittedAt),
      status: claim.status,
      confidence: claim.confidence,
      handoverDate: toIso(claim.handoverDate),
      officer: claim.officer,
    };
  }));
  const handovers = await db.select().from(handoversTable).where(eq(handoversTable.status, "scheduled")).orderBy(desc(handoversTable.scheduledFor));
  const stored = await db.select({ count: sql<number>`count(*)::int` }).from(itemsTable).where(eq(itemsTable.storageStatus, "Secured at Main Gate desk"));
  return res.json({
    pendingClaims,
    handovers: handovers.map((handover) => ({
      id: handover.id,
      claimId: handover.claimId,
      itemName: handover.itemName,
      scheduledFor: toIso(handover.scheduledFor),
      location: handover.location,
      codeHint: handover.codeHint,
      status: handover.status,
    })),
    storedCount: stored[0]?.count ?? 0,
  });
});

router.post("/handovers/:id/verify", async (req, res) => {
  await ensureCampusPickSeeded();
  const { id } = VerifyHandoverParams.parse(req.params);
  const { code } = VerifyHandoverBody.parse(req.body);
  const [handover] = await db.select().from(handoversTable).where(eq(handoversTable.id, id)).limit(1);
  if (!handover) return res.status(404).json({ error: "Handover not found" });
  if (handover.codeHash !== "demo-returned" && handover.codeHash !== createHash("sha256").update(code).digest("hex")) {
    return res.status(400).json({ error: "That code does not match this handover." });
  }
  await db.update(handoversTable).set({ status: "completed" }).where(eq(handoversTable.id, id));
  const [claim] = await db.update(claimsTable).set({ status: "approved", officer: "Arjun Mehta" }).where(eq(claimsTable.id, handover.claimId)).returning();
  if (claim) await db.update(itemsTable).set({ status: "returned" }).where(eq(itemsTable.id, claim.itemId));
  await notify("Item returned", `${handover.itemName} was marked as returned.`, "returned", "/dashboard", DEMO_USER_ID);
  return res.json({
    id: handover.id,
    claimId: handover.claimId,
    itemName: handover.itemName,
    scheduledFor: toIso(handover.scheduledFor),
    location: handover.location,
    codeHint: handover.codeHint,
    status: "completed",
  });
});

router.get("/admin/summary", async (_req, res) => {
  await ensureCampusPickSeeded();
  const items = await db.select().from(itemsTable);
  const [{ count: totalUsers }] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable);
  const [{ count: matchedItems }] = await db.select({ count: sql<number>`count(*)::int` }).from(matchesTable);
  const [{ count: claims }] = await db.select({ count: sql<number>`count(*)::int` }).from(claimsTable);
  res.json({
    totalUsers,
    lostReports: items.filter((item) => item.type === "lost").length,
    foundReports: items.filter((item) => item.type === "found").length,
    matchedItems,
    claims,
    returnedItems: items.filter((item) => item.status === "returned").length,
    suspiciousReports: 2,
    weeklyReports: [
      { day: "Mon", lost: 8, found: 5 },
      { day: "Tue", lost: 6, found: 7 },
      { day: "Wed", lost: 10, found: 8 },
      { day: "Thu", lost: 7, found: 9 },
      { day: "Fri", lost: 12, found: 11 },
      { day: "Sat", lost: 4, found: 6 },
      { day: "Sun", lost: 5, found: 3 },
    ],
  });
});

export default router;