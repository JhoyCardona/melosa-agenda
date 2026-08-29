import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// One-off: set the real prepMinutes per variant, keyed by its portions (gretica's
// numbers, Aug 29 2026). Before this, every variant was uniformly 20min from the
// original seed, which under-counted pickup times for bigger cakes.
//
//   npx ts-node src/scripts/backfillPrepMinutesByPortions.ts
const PREP_MINUTES_BY_PORTIONS: Record<number, number> = {
  2: 20, // minicake
  5: 30,
  10: 40,
  15: 50,
  20: 60,
};

async function main() {
  const variants = await prisma.productVariant.findMany();

  for (const v of variants) {
    if (v.portions === null) {
      console.log(`${v.id} "${v.label}" -> sin portions, se deja igual (prepMinutes=${v.prepMinutes})`);
      continue;
    }
    const minutes = PREP_MINUTES_BY_PORTIONS[v.portions];
    if (minutes === undefined) {
      console.log(`${v.id} "${v.label}" -> portions=${v.portions} sin regla definida, se deja igual`);
      continue;
    }
    console.log(`${v.id} "${v.label}" (portions=${v.portions}) -> prepMinutes ${v.prepMinutes} -> ${minutes}`);
    await prisma.productVariant.update({ where: { id: v.id }, data: { prepMinutes: minutes } });
  }

  console.log('Done.');
}

main()
  .catch((error) => {
    console.error('Error actualizando prepMinutes:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
