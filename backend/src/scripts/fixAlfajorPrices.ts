import { PrismaClient, ItemCategory } from '@prisma/client';

const prisma = new PrismaClient();

// One-off: correct the alfajor minicake's 6/10-porciones prices to the real
// numbers gretica gave (75.000/130.000 were placeholders from the first pass).
//   npx ts-node src/scripts/fixAlfajorPrices.ts --yes

const PRICE_BY_LABEL: Record<string, number> = {
  '6 porciones': 73000,
  '10 porciones': 125000,
};

async function main() {
  if (!process.argv.includes('--yes')) {
    console.error('Refusing to run without --yes.');
    process.exitCode = 1;
    return;
  }

  const design = await prisma.productDesign.findFirst({
    where: { category: ItemCategory.ALFAJOR_CAKE },
    include: { variants: true },
  });
  if (!design) throw new Error('No existe un diseño ALFAJOR_CAKE.');

  for (const variant of design.variants) {
    const newPrice = PRICE_BY_LABEL[variant.label];
    if (newPrice === undefined) continue;
    await prisma.productVariant.update({ where: { id: variant.id }, data: { price: newPrice } });
    console.log(`${variant.label}: $${variant.price} -> $${newPrice}`);
  }

  console.log('Listo.');
}

main()
  .catch((error) => {
    console.error('fixAlfajorPrices failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
