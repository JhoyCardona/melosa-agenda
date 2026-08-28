import { PrismaClient, ItemCategory } from '@prisma/client';

const prisma = new PrismaClient();

// One-off: give the minicake (promo) variants real price tiers so the catalog
// price filter has 2+ designs per bucket (28k / 29k / 30k / 31k / 32k+).
//
// These are PLACEHOLDER designs — edit names, photos and torta prices from
// /admin/catalogo. Torta prices here are copied from the existing designs; the
// real ones come later.

const TORTA_TEMPLATE = [
  { label: 'Torta 5 porciones', points: 6, price: 60000 },
  { label: 'Torta 10 porciones', points: 8, price: 90000 },
  { label: 'Torta 15 porciones', points: 10, price: 120000 },
  { label: 'Torta 20 porciones', points: 12, price: 150000 },
];

async function setPromoPrice(name: string, price: number) {
  const design = await prisma.productDesign.findFirst({
    where: { name },
    include: { variants: true },
  });
  if (!design) {
    console.log(`skip (not found): ${name}`);
    return;
  }
  const promo = design.variants.find((v) => v.enPromocion) ?? design.variants[0];
  await prisma.productVariant.update({ where: { id: promo.id }, data: { price } });
  console.log(`updated: ${name} — minicake -> $${price}`);
}

async function createMinicake(name: string, shape: string, price: number) {
  const existing = await prisma.productDesign.findFirst({ where: { name } });
  if (existing) {
    console.log(`skip (exists): ${name}`);
    return;
  }
  await prisma.productDesign.create({
    data: {
      name,
      category: ItemCategory.CAKE,
      shape,
      allowsCustomImage: false,
      allowsCustomText: true,
      variants: {
        create: [
          { label: 'Minicake (2 porciones)', points: 4, prepMinutes: 20, price, enPromocion: true },
          ...TORTA_TEMPLATE.map((t) => ({ ...t, prepMinutes: 20, enPromocion: false })),
        ],
      },
    },
  });
  console.log(`created: ${name} — minicake $${price}`);
}

async function main() {
  // Fix the 4 existing minicake designs (all were seeded at $15.000).
  await setPromoPrice('Minicake Azul Redonda', 28000);
  await setPromoPrice('Minicake Blanca y Rosada', 29000);
  await setPromoPrice('Minicake Roja Corazón', 30000);
  await setPromoPrice('Minicake Verde y Dorada Redonda', 31000);

  // New placeholder designs so every bucket has at least 2.
  await createMinicake('Minicake Lila Corazón', 'Corazón', 29000);
  await createMinicake('Minicake Amarilla Flores', 'Redonda', 30000);
  await createMinicake('Minicake Menta Perlas', 'Redonda', 31000);
  await createMinicake('Minicake Chocolate Cerezas', 'Redonda', 32000);
  await createMinicake('Minicake Dorada Premium', 'Corazón', 35000);
}

main()
  .catch((error) => {
    console.error('Error seeding minicake price tiers:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
