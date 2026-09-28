import "dotenv/config";
import { randomBytes } from "node:crypto";
import { db } from "../src/server/db";
import { hashPassword } from "../src/server/auth/crypto";

/** Usage: npm run admin:create -- admin@studio.com "Full Name" [password]   (a strong password is generated if omitted) */
async function main() {
  const [email, name = "Studio Admin", passwordArg] = process.argv.slice(2);
  if (!email) throw new Error('Usage: npm run admin:create -- <email> "<name>" [password]');
  const ws = await db.workspace.findFirst({ orderBy: { createdAt: "asc" } });
  if (!ws) throw new Error("Run `npm run db:seed` first.");
  const role = await db.role.findUniqueOrThrow({ where: { key: "super_admin" } });
  const password = passwordArg ?? randomBytes(12).toString("base64url");
  if (password.length < 10) throw new Error("Password must be at least 10 characters.");
  const user = await db.user.upsert({
    where: { email: email.toLowerCase() },
    create: { workspaceId: ws.id, email: email.toLowerCase(), name, passwordHash: await hashPassword(password), isStaff: true, status: "ACTIVE", emailVerifiedAt: new Date() },
    update: { passwordHash: await hashPassword(password), isStaff: true, status: "ACTIVE" },
  });
  await db.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, create: { userId: user.id, roleId: role.id }, update: {} });
  console.log(`\nSuper admin ready:\n  email:    ${user.email}\n  password: ${password}${passwordArg ? "" : "   (generated — change it after signing in)"}\n`);
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
