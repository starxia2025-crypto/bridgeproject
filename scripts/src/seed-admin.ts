import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { tenantsTable, usersTable } from "@workspace/db/schema";

async function main() {
  const email = process.env.SEED_SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_SUPERADMIN_PASSWORD?.trim();
  const name = process.env.SEED_SUPERADMIN_NAME?.trim() || "Super Admin";
  const tenantName = process.env.SEED_TENANT_NAME?.trim() || "Tenant Demo";
  const tenantSlug = process.env.SEED_TENANT_SLUG?.trim() || "demo";

  if (!email || !password) {
    throw new Error("SEED_SUPERADMIN_EMAIL and SEED_SUPERADMIN_PASSWORD are required.");
  }

  const existingUser = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (existingUser[0]) {
    console.log(`User ${email} already exists. Nothing to do.`);
    return;
  }

  let tenantId: number | null = null;

  const existingTenant = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, tenantSlug))
    .limit(1);

  if (existingTenant[0]) {
    tenantId = existingTenant[0].id;
  } else {
    const [tenant] = await db
      .insert(tenantsTable)
      .values({
        name: tenantName,
        slug: tenantSlug,
        active: true,
      })
      .returning({ id: tenantsTable.id });

    tenantId = tenant?.id ?? null;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.insert(usersTable).values({
    email,
    name,
    passwordHash,
    role: "superadmin",
    tenantId,
    active: true,
  });

  console.log(`Created superadmin ${email}${tenantId ? ` in tenant ${tenantSlug}` : ""}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
