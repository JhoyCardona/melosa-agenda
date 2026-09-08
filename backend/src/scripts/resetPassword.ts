import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Rotates an existing user's password. Never hardcode real credentials here —
// this file is committed to the repo. Pass them as CLI args instead:
//
//   npx ts-node src/scripts/resetPassword.ts <username> <newPassword>
//
// Single-user shortcut (no username): rotates the only account that exists:
//
//   npx ts-node src/scripts/resetPassword.ts <newPassword>
async function resetPassword() {
  const args = process.argv.slice(2);
  const [username, newPassword] = args.length === 1 ? [undefined, args[0]] : args;

  if (!newPassword) {
    console.error(
      'Uso: npx ts-node src/scripts/resetPassword.ts [<username>] <newPassword>'
    );
    process.exitCode = 1;
    return;
  }

  const target = username
    ? await prisma.user.findUnique({ where: { username } })
    : await prisma.user.findFirst();

  if (!target) {
    console.error('No se encontró el usuario a actualizar.');
    process.exitCode = 1;
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const user = await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash },
  });

  console.log('Contraseña actualizada para:', user.username);
}

resetPassword()
  .catch((error) => {
    console.error('Error actualizando la contraseña:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
