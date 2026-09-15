import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  categoriesTable,
  claimsTable,
  handoversTable,
  itemsTable,
  matchesTable,
  messagesTable,
  notificationsTable,
  usersTable,
} from "@workspace/db";

let seeded: Promise<void> | undefined;

export function ensureCampusPickSeeded(): Promise<void> {
  seeded ??= seed();
  return seeded;
}

async function seed() {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usersTable);
  if (count > 0) return;

  const [maya] = await db
    .insert(usersTable)
    .values({
      name: "Maya Patel",
      email: "maya.patel@campus.edu",
      role: "student",
      department: "Computer Science",
    })
    .returning();
  await db.insert(usersTable).values([
    {
      name: "Arjun Mehta",
      email: "arjun.mehta@campus.edu",
      role: "security",
      department: "Campus Safety",
    },
    {
      name: "Dr. Rhea Sen",
      email: "rhea.sen@campus.edu",
      role: "admin",
      department: "Student Affairs",
    },
  ]);

  await db.insert(categoriesTable).values([
    { name: "Electronics", icon: "laptop", itemCount: 18 },
    { name: "Cards & IDs", icon: "credit-card", itemCount: 11 },
    { name: "Keys", icon: "key-round", itemCount: 7 },
    { name: "Bags", icon: "backpack", itemCount: 9 },
    { name: "Clothing", icon: "shirt", itemCount: 6 },
    { name: "Other", icon: "box", itemCount: 12 },
  ]);

  const [lostLaptop, foundLaptop, lostKeys, foundBottle, returnedCard] =
    await db
      .insert(itemsTable)
      .values([
        {
          reportId: "LOST-2026-000124",
          type: "lost",
          itemName: "Space grey MacBook Air",
          category: "Electronics",
          description:
            "13-inch laptop in a navy sleeve, last seen after the afternoon lab.",
          brand: "Apple",
          model: "MacBook Air M2",
          color: "Space grey",
          location: "Laboratory Block",
          eventDate: "2026-09-11",
          approximateTime: "4:30 PM",
          status: "lost",
          identifyingFeatures:
            "Small constellation sticker under the trackpad; initials MP inside the sleeve.",
          submittedBy: maya.name,
        },
        {
          reportId: "FOUND-2026-000125",
          type: "found",
          itemName: "Apple laptop in navy sleeve",
          category: "Electronics",
          description:
            "Laptop found on the third-floor study table after evening cleanup.",
          brand: "Apple",
          model: "MacBook Air",
          color: "Space grey",
          location: "Laboratory Block",
          eventDate: "2026-09-11",
          approximateTime: "6:10 PM",
          condition: "Good condition",
          storageStatus: "Secured at Main Gate desk",
          status: "found",
          identifyingFeatures: "Protected for verification.",
          submittedBy: "Campus Safety",
        },
        {
          reportId: "LOST-2026-000118",
          type: "lost",
          itemName: "Brass keyring with blue tag",
          category: "Keys",
          description: "Three keys on a circular ring with a blue library tag.",
          color: "Brass / blue",
          location: "Library",
          eventDate: "2026-09-10",
          approximateTime: "11:45 AM",
          status: "matched",
          identifyingFeatures: "One key has a shallow scratch near the head.",
          submittedBy: "Kabir Rao",
        },
        {
          reportId: "FOUND-2026-000119",
          type: "found",
          itemName: "Blue reusable water bottle",
          category: "Other",
          description: "Matte blue bottle left near the auditorium seating.",
          color: "Blue",
          location: "Auditorium",
          eventDate: "2026-09-09",
          approximateTime: "2:20 PM",
          condition: "Good condition",
          storageStatus: "Stored at Security Office",
          status: "found",
          identifyingFeatures: "Protected for verification.",
          submittedBy: "Campus Safety",
        },
        {
          reportId: "FOUND-2026-000112",
          type: "found",
          itemName: "Student ID card",
          category: "Cards & IDs",
          description: "Student ID found near the north entrance.",
          color: "White",
          location: "Main Gate",
          eventDate: "2026-09-05",
          status: "returned",
          storageStatus: "Returned to owner",
          identifyingFeatures: "Protected for verification.",
          submittedBy: "Campus Safety",
        },
      ])
      .returning();

  await db.insert(matchesTable).values([
    {
      itemId: lostLaptop.id,
      matchedItemId: foundLaptop.id,
      score: 92,
      label: "Very High Match",
      reason: "Same category, campus block, color, brand, and date.",
    },
    {
      itemId: lostKeys.id,
      matchedItemId: foundBottle.id,
      score: 32,
      label: "Low Match",
      reason: "Recent report on campus, but details do not align.",
    },
  ]);

  const [claim] = await db
    .insert(claimsTable)
    .values({
      itemId: returnedCard.id,
      claimantName: "Nisha Iyer",
      uniqueMarks: "Blue lanyard loop and a small fold at the top edge.",
      additionalDetails: "The card was in a transparent sleeve.",
      status: "approved",
      confidence: 96,
      officer: "Arjun Mehta",
    })
    .returning();

  await db.insert(handoversTable).values({
    claimId: claim.id,
    itemName: returnedCard.itemName,
    scheduledFor: new Date("2026-09-05T12:30:00Z"),
    location: "Main Gate Security Desk",
    codeHash: "demo-returned",
    codeHint: "••••",
    status: "completed",
  });

  await db.insert(notificationsTable).values([
    {
      userId: maya.id,
      title: "Potential match found",
      message: "Your MacBook Air report has a 92% potential match.",
      type: "match",
      href: "/matches",
    },
    {
      userId: maya.id,
      title: "TROVIO is ready",
      message: "Keep your identifying details private until verification.",
      type: "welcome",
      href: "/profile",
      isRead: true,
    },
    {
      title: "Claim needs review",
      message: "A new ownership claim is waiting in the security queue.",
      type: "claim",
      href: "/security",
    },
  ]);

  await db.insert(messagesTable).values([
    {
      threadId: "thread-laptop",
      senderName: "Campus Safety",
      senderRole: "Security",
      body: "We have secured an Apple laptop matching your report. Please submit a claim with private identifying details.",
      itemName: "Space grey MacBook Air",
      unread: true,
    },
    {
      threadId: "thread-keys",
      senderName: "Kabir Rao",
      senderRole: "Student",
      body: "I think the keys you found may be mine. I can confirm the tag detail through the claim form.",
      itemName: "Brass keyring with blue tag",
      unread: false,
    },
  ]);
}