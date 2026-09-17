import { PrismaClient, ItemCategory } from '@prisma/client';

const prisma = new PrismaClient();

// One-off: same fix as fixCake28000LargeSizes, for the $30.000 catalog. Real
// torta sizes/prices: 6/10/15/20 porciones at 75k/130k/180k/230k.
//
//   npx ts-node src/scripts/fixCake30000LargeSizes.ts --yes

const UPDATES: { oldLabel: string; newLabel: string; portions: number; price: number }[] = [
  { oldLabel: '5 porciones', newLabel: '6 porciones', portions: 6, price: 75000 },
  { oldLabel: '10 porciones', newLabel: '10 porciones', portions: 10, price: 130000 },
  { oldLabel: '15 porciones', newLabel: '15 porciones', portions: 15, price: 180000 },
  { oldLabel: '20 porciones', newLabel: '20 porciones', portions: 20, price: 230000 },
];

async function main() {
  if (!process.argv.includes('--yes')) {
    console.error('Refusing to run without --yes.');
    process.exitCode = 1;
    return;
  }

  const designs = await prisma.productDesign.findMany({
    where: { category: ItemCategory.CAKE, variants: { some: { enPromocion: true, price: 30000 } } },
    include: { variants: true },
  });
  console.log(`Encontrados ${designs.length} diseño(s) a $30.000.`);

  let updatedVariants = 0;
  for (const design of designs) {
    for (const update of UPDATES) {
      const variant = design.variants.find((v) => v.label === update.oldLabel);
      if (!variant) continue;
      await prisma.productVariant.update({
        where: { id: variant.id },
        data: { label: update.newLabel, portions: update.portions, price: update.price },
      });
      updatedVariants += 1;
    }
  }

  console.log(`Listo. ${updatedVariants} variante(s) actualizada(s) en ${designs.length} diseño(s).`);
}

main()
  .catch((error) => {
    console.error('fixCake30000LargeSizes failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
