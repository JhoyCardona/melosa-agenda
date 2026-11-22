import 'dotenv/config';
import { PrismaClient, ItemCategory, FlavorKind } from '@prisma/client';

// Loads the starting settings for small alfajores (ALFAJOR_UNIT), as gretica
// described them in Nov 2026: three sizes (mini, personal, grande), two shapes
// (corazón, redondo) and a single flavor (alfajor with arequipe). All active,
// so a box only needs its photo + prices to show on the web. Boxes (designs),
// packagings (colors) and prices are loaded by her from the admin.
//
// Sizes: `portions` is only the sort key here (1-2-3). `prepMinutes` is a
// fallback; each box sets its own packing minutes (ProductDesign.prepMinutes).
//
// Idempotent: existing rows (same line + name) are left as they are.
// Dry run by default; --apply writes. Prints the database host first.
//   npx ts-node src/scripts/seedAlfajorUnitSettings.ts            (production, .env)
//   DOTENV_CONFIG_PATH=.env.branch npx ts-node src/scripts/seedAlfajorUnitSettings.ts --apply

const apply = process.argv.includes('--apply');
const prisma = new PrismaClient();
const category = ItemCategory.ALFAJOR_UNIT;

const SIZES = [
  { label: 'Mini', portions: 1 },
  { label: 'Personal', portions: 2 },
  { label: 'Grande', portions: 3 },
];
const SHAPES = ['Corazón', 'Redondo'];
const FLAVORS = [
  { name: 'Alfajor', kind: FlavorKind.BIZCOCHO },
  { name: 'Arequipe', kind: FlavorKind.RELLENO },
];
const FALLBACK_PREP_MINUTES = 10;

async function main() {
  const host = (process.env.DATABASE_URL ?? '').match(/@([^/:]+)/)?.[1] ?? '(unknown)';
  console.log(`Database: ${host}${apply ? '' : '  (dry run — add --apply to write)'}`);

  for (const s of SIZES) {
    const exists = await prisma.cakeSize.findUnique({ where: { category_label: { category, label: s.label } } });
    console.log(`Tamaño ${s.label}: ${exists ? 'ya existe' : 'se crea'}`);
    if (!exists && apply) {
      await prisma.cakeSize.create({
        data: { category, ...s, prepMinutes: FALLBACK_PREP_MINUTES, active: true },
      });
    }
  }
  for (const name of SHAPES) {
    const exists = await prisma.cakeShape.findUnique({ where: { category_name: { category, name } } });
    console.log(`Forma ${name}: ${exists ? 'ya existe' : 'se crea'}`);
    if (!exists && apply) await prisma.cakeShape.create({ data: { category, name, active: true } });
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
