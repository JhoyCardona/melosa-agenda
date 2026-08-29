import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Rotates an existing user's password. Never hardcode real credentials here —
// this file is committed to the repo. Pass them as CLI args instead:
//
//   npx ts-node src/scripts/resetPassword.ts <username> <newPassword>
async function resetPassword() {
  const [username, newPassword] = process.argv.slice(2);

  if (!username || !newPassword) {
    console.error('Uso: npx ts-node src/scripts/resetPassword.ts <username> <newPassword>');
    process.exitCode = 1;
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const user = await prisma.user.update({
    where: { username },
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
