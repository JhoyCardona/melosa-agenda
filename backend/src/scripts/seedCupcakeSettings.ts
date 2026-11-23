import 'dotenv/config';
import { PrismaClient, ItemCategory, FlavorKind } from '@prisma/client';

// Loads the starting settings for cupcakes (CUPCAKE), as gretica described
// them in Nov 2026:
//   - Sizes are the boxes x3, x6, x12 (`portions` = cupcakes in the box).
//     x3 and x6 pay 100% when they're the only thing in the order; x12 asks
//     for 50%. Created INACTIVE with placeholder minutes: gretica sets the real
//     minutes per box in the admin and then activates them.
//   - "Sin relleno" as a relleno with no extra cost, so a client can skip the
//     filling. Real rellenos (+$500 per cupcake) and bizcocho flavors are
//     loaded by her from the admin.
// No shapes: cupcakes don't have one.
//
// Idempotent: existing rows (same line + name) are left as they are.
// Dry run by default; --apply writes. Prints the database host first.
//   npx ts-node src/scripts/seedCupcakeSettings.ts            (production, .env)
//   DOTENV_CONFIG_PATH=.env.branch npx ts-node src/scripts/seedCupcakeSettings.ts --apply

const apply = process.argv.includes('--apply');
const prisma = new PrismaClient();
const category = ItemCategory.CUPCAKE;

const SIZES = [
  { label: 'x3', portions: 3, prepMinutes: 15, requiresFullPayment: true },
  { label: 'x6', portions: 6, prepMinutes: 20, requiresFullPayment: true },
  { label: 'x12', portions: 12, prepMinutes: 30, requiresFullPayment: false },
];
const FLAVORS = [{ name: 'Sin relleno', kind: FlavorKind.RELLENO }];

async function main() {
  const host = (process.env.DATABASE_URL ?? '').match(/@([^/:]+)/)?.[1] ?? '(unknown)';
  console.log(`Database: ${host}${apply ? '' : '  (dry run — add --apply to write)'}`);

  for (const s of SIZES) {
    const exists = await prisma.cakeSize.findUnique({ where: { category_label: { category, label: s.label } } });
    console.log(`Tamaño ${s.label}: ${exists ? 'ya existe' : 'se crea (desactivado)'}`);
    if (!exists && apply) await prisma.cakeSize.create({ data: { category, ...s, active: false } });
  }
  for (const f of FLAVORS) {
    const exists = await prisma.cakeFlavor.findUnique({
      where: { category_kind_name: { category, kind: f.kind, name: f.name } },
    });
    console.log(`Sabor ${f.kind} ${f.name}: ${exists ? 'ya existe' : 'se crea'}`);
    if (!exists && apply) await prisma.cakeFlavor.create({ data: { category, ...f, active: true } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
