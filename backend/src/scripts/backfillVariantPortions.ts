import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// One-off: populate the new ProductVariant.portions column for every existing
// variant, parsed from its current label as a best-effort starting point.
// Going forward `portions` is set explicitly from the catalog admin screen —
// this script only seeds it once so nothing starts out null by accident.
//
//   npx ts-node src/scripts/backfillVariantPortions.ts

function guessPortions(label: string): number | null {
  const match = label.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

async function main() {
  const variants = await prisma.productVariant.findMany({ where: { portions: null } });

  for (const v of variants) {
    const portions = guessPortions(v.label);
    console.log(`${v.id} "${v.label}" -> portions=${portions}`);
    if (portions !== null) {
      await prisma.productVariant.update({ where: { id: v.id }, data: { portions } });
    }
  }

  console.log(`Done. Updated ${variants.filter((v) => guessPortions(v.label) !== null).length}/${variants.length} variants.`);
}

main()
  .catch((error) => {
    console.error('Error backfilling portions:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
