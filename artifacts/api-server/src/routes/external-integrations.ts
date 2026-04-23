import crypto from "node:crypto";
import { Router } from "express";
import { and, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import { ticketsTable, usersTable } from "@workspace/db/schema";
import { createAuditLog } from "../lib/audit.js";
import { stringifyDbJson } from "../lib/db-json.js";

const router = Router();

const externalIntegrationTypeEnum = ["email_change", "cancellation"] as const;

const basePayloadSchema = z.object({
  externalId: z.string().trim().min(1),
  type: z.enum(externalIntegrationTypeEnum),
  reporterEmail: z.string().trim().email(),
  affectedEmail: z.string().trim().email(),
  orderId: z.string().trim().min(1),
  title: z.string().trim().min(3),
  description: z.string().trim().min(10),
  reason: z.string().trim().min(1),
});

const emailChangePayloadSchema = basePayloadSchema.extend({
  type: z.literal("email_change"),
  newEmail: z.string().trim().email(),
});

const cancellationPayloadSchema = basePayloadSchema.extend({
  type: z.literal("cancellation"),
  isbn: z.string().trim().min(1),
});

const externalPayloadSchema = z.discriminatedUnion("type", [
  emailChangePayloadSchema,
  cancellationPayloadSchema,
]);

type ExternalPayload = z.infer<typeof externalPayloadSchema>;

function generateTicketNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `TKT-${timestamp}-${random}`;
}

function getConfiguredTenantId() {
  const rawValue = process.env["EXTERNAL_INTEGRATION_TENANT_ID"];
  const parsedValue = rawValue ? Number(rawValue) : Number.NaN;
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function getConfiguredSchoolId() {
  const rawValue = process.env["EXTERNAL_INTEGRATION_SCHOOL_ID"];
  const parsedValue = rawValue ? Number(rawValue) : Number.NaN;
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function buildTicketCategory(type: ExternalPayload["type"]) {
  return type === "email_change" ? "modificar_correo" : "devolucion_cancelacion";
}

function buildCustomFields(payload: ExternalPayload) {
  const commonFields = {
    source: "external_integration",
    externalIntegration: {
      externalId: payload.externalId,
      type: payload.type,
      reporterEmail: payload.reporterEmail,
      affectedEmail: payload.affectedEmail,
      orderId: payload.orderId,
      reason: payload.reason,
      receivedAt: new Date().toISOString(),
    },
  };

  if (payload.type === "email_change") {
    return {
      ...commonFields,
      affectedEmail: payload.affectedEmail,
      newEmail: payload.newEmail,
      orderId: payload.orderId,
      reason: payload.reason,
    };
  }

  return {
    ...commonFields,
    affectedEmail: payload.affectedEmail,
    orderId: payload.orderId,
    isbn: payload.isbn,
    reason: payload.reason,
  };
}

async function findDuplicateTicket(externalId: string) {
  const duplicateTickets = await db
    .select({
      id: ticketsTable.id,
      ticketNumber: ticketsTable.ticketNumber,
    })
    .from(ticketsTable)
    .where(
      and(
        sql`JSON_UNQUOTE(JSON_EXTRACT(${ticketsTable.customFields}, '$.source')) = 'external_integration'`,
        sql`JSON_UNQUOTE(JSON_EXTRACT(${ticketsTable.customFields}, '$.externalIntegration.externalId')) = ${externalId}`,
      ),
    )
    .limit(1);

  return duplicateTickets[0] ?? null;
}

async function resolveCreatedById(reporterEmail: string) {
  const normalizedEmail = reporterEmail.toLowerCase();
  const matchingUsers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail))
    .limit(1);

  if (matchingUsers[0]?.id) {
    return matchingUsers[0].id;
  }

  const fallbackUserId = process.env["EXTERNAL_INTEGRATION_FALLBACK_USER_ID"];
  const parsedFallbackUserId = fallbackUserId ? Number(fallbackUserId) : Number.NaN;
  if (Number.isInteger(parsedFallbackUserId) && parsedFallbackUserId > 0) {
    return parsedFallbackUserId;
  }

  const fallbackUserEmail = process.env["EXTERNAL_INTEGRATION_FALLBACK_USER_EMAIL"]?.trim().toLowerCase();
  if (fallbackUserEmail) {
    const fallbackUsers = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, fallbackUserEmail))
      .limit(1);

    if (fallbackUsers[0]?.id) {
      return fallbackUsers[0].id;
    }
  }

  const technicalUsers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.active, true),
        or(eq(usersTable.role, "tecnico"), eq(usersTable.role, "superadmin")),
      ),
    )
    .limit(1);

  return technicalUsers[0]?.id ?? null;
}

function isValidApiKey(requestApiKey: string | undefined) {
  const configuredApiKey = process.env["EXTERNAL_INTEGRATION_API_KEY"]?.trim();
  if (!configuredApiKey) {
    return true;
  }

  return requestApiKey === configuredApiKey;
}

router.post("/external", async (req, res) => {
  if (!isValidApiKey(req.header("x-api-key") ?? undefined)) {
    res.status(401).json({
      ok: false,
      error: "Unauthorized",
      message: "API key no valida.",
    });
    return;
  }

  const parsedPayload = externalPayloadSchema.safeParse(req.body);
  if (!parsedPayload.success) {
    res.status(400).json({
      ok: false,
      error: "ValidationError",
      message: "Payload no valido.",
      details: parsedPayload.error.flatten(),
    });
    return;
  }

  const tenantId = getConfiguredTenantId();
  if (!tenantId) {
    res.status(503).json({
      ok: false,
      error: "ConfigurationError",
      message: "Falta configurar EXTERNAL_INTEGRATION_TENANT_ID.",
    });
    return;
  }

  const duplicateTicket = await findDuplicateTicket(parsedPayload.data.externalId);
  if (duplicateTicket) {
    res.status(200).json({
      ok: true,
      ticketId: duplicateTicket.id,
      ticketNumber: duplicateTicket.ticketNumber,
      duplicate: true,
    });
    return;
  }

  const createdById = await resolveCreatedById(parsedPayload.data.reporterEmail);
  if (!createdById) {
    res.status(503).json({
      ok: false,
      error: "ConfigurationError",
      message: "No se pudo resolver un usuario creador para la integracion externa.",
    });
    return;
  }

  const ticketNumber = generateTicketNumber();
  const schoolId = getConfiguredSchoolId();
  const customFields = buildCustomFields(parsedPayload.data);

  await db.insert(ticketsTable).values({
    ticketNumber,
    title: parsedPayload.data.title,
    description: parsedPayload.data.description,
    status: "nuevo",
    priority: "media",
    category: buildTicketCategory(parsedPayload.data.type),
    tenantId,
    schoolId,
    createdById,
    customFields: stringifyDbJson(customFields),
  } as any);

  const createdTickets = await db
    .select({
      id: ticketsTable.id,
      ticketNumber: ticketsTable.ticketNumber,
    })
    .from(ticketsTable)
    .where(eq(ticketsTable.ticketNumber, ticketNumber))
    .limit(1);

  const createdTicket = createdTickets[0];
  if (!createdTicket) {
    res.status(500).json({
      ok: false,
      error: "InternalServerError",
      message: "El ticket se creo pero no se pudo recuperar.",
    });
    return;
  }

  await createAuditLog({
    action: "external_integration_create",
    entityType: "ticket",
    entityId: createdTicket.id,
    userId: createdById,
    tenantId,
    newValues: {
      externalId: parsedPayload.data.externalId,
      type: parsedPayload.data.type,
      reporterEmail: parsedPayload.data.reporterEmail,
      orderId: parsedPayload.data.orderId,
    },
  });

  res.status(201).json({
    ok: true,
    ticketId: createdTicket.id,
    ticketNumber: createdTicket.ticketNumber,
    duplicate: false,
  });
});

export default router;
