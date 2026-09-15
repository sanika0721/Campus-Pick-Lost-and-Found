import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import {
  boolean,
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable("campus_users", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").unique(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("student"),
  department: text("department"),
  suspended: boolean("suspended").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const categoriesTable = pgTable("campus_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  icon: text("icon").notNull().default("box"),
  itemCount: integer("item_count").notNull().default(0),
});

export const locationsTable = pgTable("campus_locations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
});

export const itemsTable = pgTable("campus_items", {
  id: serial("id").primaryKey(),
  reportId: text("report_id").notNull().unique(),
  type: text("type").notNull(),
  itemName: text("item_name").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  brand: text("brand"),
  model: text("model"),
  color: text("color"),
  location: text("location").notNull(),
  eventDate: date("event_date", { mode: "string" }).notNull(),
  approximateTime: text("approximate_time"),
  condition: text("condition"),
  status: text("status").notNull().default("lost"),
  imageUrl: text("image_url"),
  identifyingFeatures: text("identifying_features"),
  storageStatus: text("storage_status"),
  submittedBy: text("submitted_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const savedItemsTable = pgTable("campus_saved_items", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull(),
  userId: integer("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const matchesTable = pgTable("campus_matches", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull(),
  matchedItemId: integer("matched_item_id").notNull(),
  score: integer("score").notNull(),
  label: text("label").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("potential"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const claimsTable = pgTable("campus_claims", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull(),
  claimantName: text("claimant_name").notNull(),
  uniqueMarks: text("unique_marks").notNull(),
  contents: text("contents"),
  serialNumber: text("serial_number"),
  additionalDetails: text("additional_details").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull().default("pending"),
  confidence: integer("confidence").notNull().default(0),
  handoverDate: timestamp("handover_date", { withTimezone: true }),
  officer: text("officer"),
});

export const notificationsTable = pgTable("campus_notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull(),
  href: text("href"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messagesTable = pgTable("campus_messages", {
  id: serial("id").primaryKey(),
  threadId: text("thread_id").notNull(),
  senderName: text("sender_name").notNull(),
  senderRole: text("sender_role").notNull(),
  body: text("body").notNull(),
  itemName: text("item_name"),
  unread: boolean("unread").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const handoversTable = pgTable("campus_handovers", {
  id: serial("id").primaryKey(),
  claimId: integer("claim_id").notNull(),
  itemName: text("item_name").notNull(),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
  location: text("location").notNull(),
  codeHash: text("code_hash").notNull(),
  codeHint: text("code_hint").notNull(),
  status: text("status").notNull().default("scheduled"),
});

export const reportsTable = pgTable("campus_reports", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id"),
  type: text("type").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditRecordsTable = pgTable("campus_audit_records", {
  id: serial("id").primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: integer("entity_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertItemSchema = createInsertSchema(itemsTable).omit({
  id: true,
  reportId: true,
  createdAt: true,
});
export type InsertItem = z.infer<typeof insertItemSchema>;
export type Item = typeof itemsTable.$inferSelect;
export type Claim = typeof claimsTable.$inferSelect;
export type User = typeof usersTable.$inferSelect;