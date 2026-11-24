import 'dotenv/config';
import { PrismaClient, ItemCategory } from '@prisma/client';

// Moves small alfajores (ALFAJOR_UNIT) to the flavor + box model (Nov 24 2026):
//  - creates the box quantities gretica defined (x6, x15, x22, x30, x40, x50)
//    with their packing minutes (10 up to x30, 20 above), active;
//  - creates the "Clásica" box (active; gretica uploads its photo and prices);
//  - leaves only the Mini size active (personal/grande aren't packaged yet);
//  - archives the old box-as-design rows ("Caja x6 Alfajores"), which are no
//    longer bookable. Archived rows survive, so any order pointing at them reads.
//
// Idempotent. Dry run by default; --apply writes. Prints the database host first.
//   npx ts-node src/scripts/seedAlfajorFlavorBoxes.ts            (production, .env)
//   DOTENV_CONFIG_PATH=.env.branch npx ts-node src/scripts/seedAlfajorFlavorBoxes.ts --apply

const apply = process.argv.includes('--apply');
const prisma = new PrismaClient();
const category = ItemCategory.ALFAJOR_UNIT;

const QUANTITIES = [6, 15, 22, 30, 40, 50].map((units) => ({ units, prepMinutes: units <= 30 ? 10 : 20 }));
const DEFAULT_BOX = 'Clásica';
const ACTIVE_SIZES = ['Mini'];

async function main() {
  const host = (process.env.DATABASE_URL ?? '').match(/@([^/:]+)/)?.[1] ?? '(unknown)';
  console.log(`Database: ${host}${apply ? '' : '  (dry run — add --apply to write)'}`);

  for (const q of QUANTITIES) {
    const exists = await prisma.alfajorQuantity.findUnique({ where: { units: q.units } });
    console.log(`Cantidad x${q.units} (${q.prepMinutes} min): ${exists ? 'ya existe' : 'se crea'}`);
    if (!exists && apply) await prisma.alfajorQuantity.create({ data: { ...q, active: true } });
  }

  const box = await prisma.alfajorBox.findUnique({ where: { name: DEFAULT_BOX } });
  console.log(`Caja ${DEFAULT_BOX}: ${box ? 'ya existe' : 'se crea (sin foto ni precios todavía)'}`);
  if (!box && apply) await prisma.alfajorBox.create({ data: { name: DEFAULT_BOX, active: true } });

  const sizes = await prisma.cakeSize.findMany({ where: { category } });
  for (const s of sizes) {
    const shouldBeActive = ACTIVE_SIZES.includes(s.label);
    if (s.active === shouldBeActive) {
      console.log(`Tamaño ${s.label}: ya está ${s.active ? 'activo' : 'desactivado'}`);
      continue;
    }
    console.log(`Tamaño ${s.label}: se ${shouldBeActive ? 'activa' : 'desactiva'}`);
    if (apply) await prisma.cakeSize.update({ where: { id: s.id }, data: { active: shouldBeActive } });
  }

  const oldBoxes = await prisma.productDesign.findMany({
    where: { category, archivedAt: null, unitsPerBox: { not: null } },
  });
  for (const d of oldBoxes) {
    console.log(`Diseño viejo "${d.name}" (caja x${d.unitsPerBox}): se archiva`);
    if (apply) await prisma.productDesign.update({ where: { id: d.id }, data: { archivedAt: new Date() } });
  }
  if (oldBoxes.length === 0) console.log('No hay diseños viejos de caja por archivar');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
