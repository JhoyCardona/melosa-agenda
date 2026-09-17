import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// One-off: delete every ProductDesign whose promo (minicake) variant sits at a
// given price. Used to clean up the $29.000 designs after that tier was
// renamed to $30.000 and re-added under the new price — they were exact
// duplicates (same design/colors) left behind at the old price.
//
// Refuses if any of the matched designs has order history (variants cascade,
// but OrderItem.productDesignId is onDelete: Restrict — this check just gives
// a clear message up front instead of a raw FK error).
//
//   npx ts-node src/scripts/removeDesignsByMinicakePrice.ts --yes 29000

async function main() {
  const args = process.argv.slice(2);
  if (!args.includes('--yes')) {
    console.error('Refusing to run without --yes.');
    process.exitCode = 1;
    return;
  }
  const priceArg = args.find((a) => a !== '--yes');
  const price = priceArg ? Number(priceArg) : NaN;
  if (!Number.isFinite(price)) {
    console.error('Dime el precio a eliminar, ej: --yes 29000');
    process.exitCode = 1;
    return;
  }

  const designs = await prisma.productDesign.findMany({
    where: { variants: { some: { enPromocion: true, price } } },
    include: { _count: { select: { orderItems: true } }, variants: { where: { enPromocion: true } } },
  });

  if (designs.length === 0) {
    console.log(`No hay diseños con variante promo a $${price}.`);
    return;
  }

  const withOrders = designs.filter((d) => d._count.orderItems > 0);
  if (withOrders.length > 0) {
    throw new Error(
      `${withOrders.length} diseño(s) a $${price} tienen pedidos que los referencian — abortando para no perder historial.`
    );
  }

  console.log(`Eliminando ${designs.length} diseño(s) a $${price}...`);
  const ids = designs.map((d) => d.id);
  const deleted = await prisma.productDesign.deleteMany({ where: { id: { in: ids } } });
  console.log(`Listo. ${deleted.count} diseño(s) eliminado(s) (variantes + imágenes en cascada).`);
}

main()
  .catch((error) => {
    console.error('removeDesignsByMinicakePrice failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
