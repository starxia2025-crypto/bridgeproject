import { pgTable, serial, text, boolean, timestamp, varchar, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tenantsTable = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  legalName: varchar("legal_name", { length: 255 }),
  educationGroupType: varchar("education_group_type", { length: 80 }).default("school_group"),
  dbSchema: varchar("db_schema", { length: 100 }),
  active: boolean("active").notNull().default(true),
  logoUrl: text("logo_url"),
  primaryColor: varchar("primary_color", { length: 20 }),
  sidebarBackgroundColor: varchar("sidebar_background_color", { length: 20 }),
  sidebarTextColor: varchar("sidebar_text_color", { length: 20 }),
  quickLinks: jsonb("quick_links").$type<Array<{ label: string; url: string; icon: string }>>().default([]),
  contactEmail: varchar("contact_email", { length: 255 }),
  supportEmail: varchar("support_email", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTenantSchema = createInsertSchema(tenantsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenantsTable.$inferSelect;
