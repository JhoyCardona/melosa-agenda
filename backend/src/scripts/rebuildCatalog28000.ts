import fs from 'fs';
import path from 'path';
import { PrismaClient, ItemCategory } from '@prisma/client';
import cloudinary from '../config/cloudinary';

const prisma = new PrismaClient();

// One-off: wipe the whole catalog and rebuild it from the client's organised
// $28.000 minicake photo set. Every design is nameless and description-less on
// purpose — the photo is the identity, and it's the photo that shows up on the
// order. The source folder tree encodes the two things that vary:
//
//   maximo_20_letras/ -> allowsCustomText: true   (client can add a phrase/number)
//   sin_texto/        -> allowsCustomText: false
//   .../corazon/      -> shape: "Corazón"
//   .../redondas/     -> shape: "Redonda"
//
// Run it against prod the same way the earlier seed scripts were run:
//   npx ts-node src/scripts/rebuildCatalog28000.ts --yes

const SOURCE_ROOT =
  process.env.CATALOG_SOURCE_ROOT ??
  '/home/jhoyners-cardona/Downloads/promo-minickaes-melosa/28000';

interface FolderRule {
  relDir: string;
  allowsCustomText: boolean;
  shape: string;
}

const FOLDER_RULES: FolderRule[] = [
  { relDir: 'maximo_20_letras/corazon', allowsCustomText: true, shape: 'Corazón' },
  { relDir: 'maximo_20_letras/redondas', allowsCustomText: true, shape: 'Redonda' },
  { relDir: 'sin_texto/corazon', allowsCustomText: false, shape: 'Corazón' },
  { relDir: 'sin_texto/redondas', allowsCustomText: false, shape: 'Redonda' },
];

// Same 5-size shape every design gets. Minicake (2 porciones) is the promo, at
// the real $28.000; the torta sizes keep the placeholder prices from
// seedMinicakePriceTiers.ts until gretica confirms the real ones from
// /admin/catalogo.
const VARIANT_TEMPLATE = [
  { label: 'Minicake (2 porciones)', price: 28000, points: 4, prepMinutes: 20, portions: null, enPromocion: true },
  { label: 'Torta 5 porciones', price: 60000, points: 6, prepMinutes: 20, portions: 5, enPromocion: false },
  { label: 'Torta 10 porciones', price: 90000, points: 8, prepMinutes: 20, portions: 10, enPromocion: false },
  { label: 'Torta 15 porciones', price: 120000, points: 10, prepMinutes: 20, portions: 15, enPromocion: false },
  { label: 'Torta 20 porciones', price: 150000, points: 12, prepMinutes: 20, portions: 20, enPromocion: false },
];

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png']);

function mimeFor(file: string): string {
  return path.extname(file).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
}

async function uploadToCloudinary(absPath: string): Promise<string> {
  const buffer = fs.readFileSync(absPath);
  const dataUri = `data:${mimeFor(absPath)};base64,${buffer.toString('base64')}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    folder: 'melosa-agenda',
    transformation: [
      { width: 1200, crop: 'limit' },
      { quality: 'auto' },
      { fetch_format: 'auto' },
    ],
  });
  return result.secure_url;
}

async function main() {
  if (!process.argv.includes('--yes')) {
    console.error(
      'Refusing to run without --yes. This DELETES every ProductDesign and rebuilds the catalog.'
    );
    process.exitCode = 1;
    return;
  }

  // Collect the source files first, so we fail before touching the DB if the
  // folder tree isn't where we expect.
  const jobs: { absPath: string; rule: FolderRule }[] = [];
  for (const rule of FOLDER_RULES) {
    const dir = path.join(SOURCE_ROOT, rule.relDir);
    if (!fs.existsSync(dir)) {
      throw new Error(`Source folder not found: ${dir}`);
    }
    const files = fs
      .readdirSync(dir)
      .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
      .sort();
    for (const f of files) jobs.push({ absPath: path.join(dir, f), rule });
  }
  if (jobs.length === 0) throw new Error(`No images found under ${SOURCE_ROOT}`);
  console.log(`Found ${jobs.length} source images.`);

  // Safety: never orphan order history. With FK onDelete: Restrict, a delete
  // would throw anyway, but this gives a clear message instead.
  const referenced = await prisma.orderItem.count({ where: { productDesignId: { not: null } } });
  if (referenced > 0) {
    throw new Error(
      `${referenced} order item(s) still reference a catalog design — aborting so history stays intact.`
    );
  }

  const deleted = await prisma.productDesign.deleteMany({});
  console.log(`Deleted ${deleted.count} existing ProductDesign row(s) (variants cascade).`);

  let created = 0;
  for (const { absPath, rule } of jobs) {
    const imageUrl = await uploadToCloudinary(absPath);
    await prisma.productDesign.create({
      data: {
        name: '',
        category: ItemCategory.CAKE,
        shape: rule.shape,
        imageUrl,
        allowsCustomImage: false,
        allowsCustomText: rule.allowsCustomText,
        variants: {
          create: VARIANT_TEMPLATE.map((v) => ({
            label: v.label,
            price: v.price,
            points: v.points,
            prepMinutes: v.prepMinutes,
            ...(v.portions !== null && { portions: v.portions }),
            enPromocion: v.enPromocion,
          })),
        },
      },
    });
    created += 1;
    console.log(
      `  [${created}/${jobs.length}] ${rule.shape} · texto=${rule.allowsCustomText ? 'sí' : 'no'} · ${path.basename(absPath)}`
    );
  }

  const byShape = await prisma.productDesign.groupBy({ by: ['shape'], _count: true });
  const withText = await prisma.productDesign.count({ where: { allowsCustomText: true } });
  console.log(
    `\nDone. ${created} designs created. Con texto: ${withText}, sin texto: ${created - withText}.`
  );
  console.log('Por forma:', byShape.map((g) => `${g.shape}=${g._count}`).join(', '));
}

main()
  .catch((error) => {
    console.error('rebuildCatalog28000 failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
