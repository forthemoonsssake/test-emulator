import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

export const history = pgTable("history", {
  id: serial("id").primaryKey(),
  visitor: text("visitor").notNull(),
  url: text("url").notNull(),
  title: text("title"),
  profileLabel: text("profile_label"),
  engine: text("engine"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessionLog = pgTable("session_log", {
  id: serial("id").primaryKey(),
  visitor: text("visitor").notNull(),
  profileLabel: text("profile_label"),
  pageCount: integer("page_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type HistoryRow = typeof history.$inferSelect;
