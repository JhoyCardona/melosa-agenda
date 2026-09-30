import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Copies the catalog v2 global settings — sizes, flavors, flavor surcharges and
// shapes — from the Neon test branch (.env.branch) into the database in
// DATABASE_URL (.env → production). Designs, colors and prices are NOT copied:
// those get loaded from scratch on production through the admin.
//
// Rows keep their ids and are upserted, so running it twice is harmless. It
// reads the target first and refuses to touch sizes/flavors/shapes whose unique
// name already exists there under a different id.
//
// Dry run by default; --apply writes. It prints both database hosts first.
//   npx ts-node src/scripts/copyCakeSettingsFromBranch.ts --apply

const apply = process.argv.includes('--apply');

const branchEnv = dotenv.parse(fs.readFileSync(path.join(__dirname, '../../.env.branch')));
const source = new PrismaClient({ datasources: { db: { url: branchEnv.DATABASE_URL } } });
const target = new PrismaClient();

const hostOf = (url?: string) => (url ?? '').match(/@([^/:]+)/)?.[1] ?? '(unknown)';

async function main() {
  console.log(`From (branch): ${hostOf(branchEnv.DATABASE_URL)}`);
  console.log(`To:            ${hostOf(process.env.DATABASE_URL)}`);
  if (branchEnv.DATABASE_URL === process.env.DATABASE_URL) throw new Error('Source and target are the same database');
  console.log(apply ? 'Mode: APPLY' : 'Mode: dry run (pass --apply to write)');

  const [sizes, flavors, surcharges, shapes] = await Promise.all([
    source.cakeSize.findMany({ orderBy: { portions: 'asc' } }),
    source.cakeFlavor.findMany({ orderBy: { name: 'asc' } }),
    source.flavorSurcharge.findMany(),
    source.cakeShape.findMany({ orderBy: { name: 'asc' } }),
  ]);
  console.log(`Sizes (${sizes.length}): ${sizes.map((s) => s.label).join(', ')}`);
  console.log(`Flavors (${flavors.length}): ${flavors.map((f) => `${f.name} [${f.kind}]`).join(', ')}`);
  console.log(`Surcharges: ${surcharges.length}`);
  console.log(`Shapes (${shapes.length}): ${shapes.map((s) => s.name).join(', ')}`);

  // Same unique name under another id would make the upsert fail halfway.
  const [tSizes, tFlavors, tShapes] = await Promise.all([
    target.cakeSize.findMany(),
    target.cakeFlavor.findMany(),
    target.cakeShape.findMany(),
  ]);
  const clashes = [
    ...sizes.filter((s) => tSizes.some((t) => t.id !== s.id && (t.label === s.label || t.portions === s.portions))).map((s) => `size ${s.label}`),
    ...flavors.filter((f) => tFlavors.some((t) => t.id !== f.id && t.kind === f.kind && t.name === f.name)).map((f) => `flavor ${f.name}`),
    ...shapes.filter((s) => tShapes.some((t) => t.id !== s.id && t.name === s.name)).map((s) => `shape ${s.name}`),
  ];
  if (clashes.length > 0) throw new Error(`Already in target with another id: ${clashes.join(', ')}`);

  if (!apply) return;

  await target.$transaction(
    async (tx) => {
      for (const s of sizes) await tx.cakeSize.upsert({ where: { id: s.id }, create: s, update: s });
      for (const f of flavors) await tx.cakeFlavor.upsert({ where: { id: f.id }, create: f, update: f });
      for (const s of shapes) await tx.cakeShape.upsert({ where: { id: s.id }, create: s, update: s });
      for (const sc of surcharges) {
        await tx.flavorSurcharge.upsert({
          where: { flavorId_sizeId: { flavorId: sc.flavorId, sizeId: sc.sizeId } },
          create: sc,
          update: { amount: sc.amount },
        });
      }
    },
    { timeout: 60000, maxWait: 15000 }
  );
  console.log('Copied.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => Promise.all([source.$disconnect(), target.$disconnect()]));
