import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function createUser() {
  const username = 'gretica'; // cambiá esto por el usuario que quieras
  const plainPassword ='gretica122497'; // cambiá esto por la contraseña real

  const passwordHash = await bcrypt.hash(plainPassword, 10);

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
    },
  });

  console.log('Usuario creado:', user);
}

createUser()
  .catch((error) => {
    console.error('Error creando el usuario:', error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
