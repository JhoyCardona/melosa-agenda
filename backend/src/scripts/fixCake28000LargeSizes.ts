import { PrismaClient, ItemCategory } from '@prisma/client';

const prisma = new PrismaClient();

// One-off: the $28.000 CAKE designs were created with placeholder torta sizes
// (5/10/15/20 porciones at 60k/90k/120k/150k, from the "tortas 5+ deshabilitadas
// temporalmente" era). Real sizes/prices landed: 6/10/15/20 porciones at
// 73k/125k/170k/210k — the 5-porciones variant is renamed to 6, the rest just
// get their real price. Only touches designs whose minicake sits at exactly
// $28.000 — the $30.000 catalog's placeholder large sizes are untouched.
//
//   npx ts-node src/scripts/fixCake28000LargeSizes.ts --yes

const UPDATES: { oldLabel: string; newLabel: string; portions: number; price: number }[] = [
  { oldLabel: '5 porciones', newLabel: '6 porciones', portions: 6, price: 73000 },
  { oldLabel: '10 porciones', newLabel: '10 porciones', portions: 10, price: 125000 },
  { oldLabel: '15 porciones', newLabel: '15 porciones', portions: 15, price: 170000 },
  { oldLabel: '20 porciones', newLabel: '20 porciones', portions: 20, price: 210000 },
];

async function main() {
  if (!process.argv.includes('--yes')) {
    console.error('Refusing to run without --yes.');
    process.exitCode = 1;
    return;
  }

  const designs = await prisma.productDesign.findMany({
    where: { category: ItemCategory.CAKE, variants: { some: { enPromocion: true, price: 28000 } } },
    include: { variants: true },
  });
  console.log(`Encontrados ${designs.length} diseño(s) a $28.000.`);

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
    console.error('fixCake28000LargeSizes failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
