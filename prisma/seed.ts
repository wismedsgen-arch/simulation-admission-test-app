import { UserRole } from "@prisma/client";

import { hashPassword } from "../src/lib/auth/crypto";
import { prisma } from "../src/lib/db/prisma";

async function main() {
  const name = process.env.BOOTSTRAP_ADMIN_NAME;
  const governmentId = process.env.BOOTSTRAP_ADMIN_ID;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!name || !governmentId || !password) {
    return;
  }

  const existing = await prisma.user.findUnique({
    where: {
      governmentId
    }
  });

  if (existing) {
    return;
  }

  await prisma.user.create({
    data: {
      fullName: name,
      governmentId,
      passwordHash: await hashPassword(password),
      role: UserRole.ADMIN,
      isApproved: true
    }
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
