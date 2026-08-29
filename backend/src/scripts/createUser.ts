import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Creates a new user. Never hardcode real credentials here — this file is
// committed to the repo. Pass them as CLI args instead:
//
//   npx ts-node src/scripts/createUser.ts <username> <password>
async function createUser() {
  const [username, plainPassword] = process.argv.slice(2);

  if (!username || !plainPassword) {
    console.error('Uso: npx ts-node src/scripts/createUser.ts <username> <password>');
    process.exitCode = 1;
    return;
  }

  const passwordHash = await bcrypt.hash(plainPassword, 10);

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
    },
  });

  console.log('Usuario creado:', { id: user.id, username: user.username });
}

createUser()
  .catch((error) => {
    console.error('Error creando el usuario:', error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
