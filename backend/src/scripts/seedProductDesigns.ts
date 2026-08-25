import { PrismaClient, ItemCategory } from '@prisma/client';

const prisma = new PrismaClient();

// Placeholder prices — replace with gretica's real prices once confirmed.
// Points match the CLAUDE.md table: minicake=4, 5p=6, 10p=8, 15p=10, 20p=12.
async function seedProductDesigns() {
  const torta = await prisma.productDesign.create({
    data: {
      name: 'Torta de Chocolate (placeholder)',
      category: ItemCategory.CAKE,
      variants: {
        create: [
          { label: 'Minicake (2 porciones)', price: 15000, points: 4, enPromocion: true },
          { label: 'Torta 5 porciones', price: 15000, points: 6 },
          { label: 'Torta 10 porciones', price: 60000, points: 8 },
          { label: 'Torta 15 porciones', price: 90000, points: 10 },
          { label: 'Torta 20 porciones', price: 120000, points: 12 },
        ],
      },
    },
    include: { variants: true },
  });

  console.log('ProductDesign creado:', torta);
}

seedProductDesigns()
  .catch((error) => {
    console.error('Error cargando ProductDesign:', error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
