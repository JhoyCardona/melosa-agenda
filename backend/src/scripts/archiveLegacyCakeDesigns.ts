import 'dotenv/config';
import { PrismaClient, ItemCategory } from '@prisma/client';

// Retires the pre-v2 cake catalog: every CAKE design that still has
// ProductVariant rows (the legacy variant-based catalog) gets archivedAt set.
// Archived designs disappear from the public catalog and the admin, but their
// rows stay, so past orders keep showing their design (OrderItem.productDesign
// is onDelete: Restrict — deleting isn't possible for designs with orders).
//
// The alfajor minicake (ALFAJOR_CAKE) is left alone: it's still sold through
// the Landing's own "Agendar" button until the alfajor module exists.
//
// Dry run by default; --apply writes. It prints the database host first.
//   Neon branch: DOTENV_CONFIG_PATH=.env.branch npx ts-node src/scripts/archiveLegacyCakeDesigns.ts --apply
//   Production:  npx ts-node src/scripts/archiveLegacyCakeDesigns.ts --apply

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

async function main() {
  const host = (process.env.DATABASE_URL ?? '').match(/@([^/:]+)/)?.[1] ?? '(unknown)';
  console.log(`Database: ${host}`);
  console.log(apply ? 'Mode: APPLY' : 'Mode: dry run (pass --apply to write)');

  const legacy = await prisma.productDesign.findMany({
    where: { category: ItemCategory.CAKE, archivedAt: null, variants: { some: {} } },
    include: { _count: { select: { orderItems: true } } },
  });
  const withOrders = legacy.filter((d) => d._count.orderItems > 0).length;
  console.log(`Legacy CAKE designs to archive: ${legacy.length} (${withOrders} referenced by orders)`);

  if (!apply || legacy.length === 0) return;

  const result = await prisma.productDesign.updateMany({
    where: { id: { in: legacy.map((d) => d.id) } },
    data: { archivedAt: new Date() },
  });
  console.log(`Archived: ${result.count}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
