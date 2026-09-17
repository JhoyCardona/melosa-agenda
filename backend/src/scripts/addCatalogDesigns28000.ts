import fs from 'fs';
import path from 'path';
import { PrismaClient, ItemCategory } from '@prisma/client';
import cloudinary from '../config/cloudinary';

const prisma = new PrismaClient();

// One-off: ADD new color-variant designs from the $28.000 minicake photo set,
// WITHOUT touching anything already in the catalog (unlike rebuildCatalog28000,
// which wipes everything first). Used to bring in the first few designs of the
// new color-picker structure — 28000/<designNumber>/<colorName>.jpg — while the
// old flat one-photo-per-design catalog stays untouched for prod.
//
// Not idempotent: re-running adds duplicate ProductDesign rows for a folder
// already loaded. Pass which numbered folders to add explicitly so nothing
// gets added by accident as gretica keeps organising more of them.
//
//   npx ts-node src/scripts/addCatalogDesigns28000.ts --yes 1 2

const SOURCE_ROOT =
  process.env.CATALOG_SOURCE_ROOT ??
  '/home/jhoyners-cardona/proyects/melosa/imagenes-promo-minicakes/28000';

const VARIANT_TEMPLATE = [
  { label: 'Minicake (2 porciones)', price: 28000, points: 4, prepMinutes: 20, portions: null, enPromocion: true },
  { label: '6 porciones', price: 73000, points: 6, prepMinutes: 20, portions: 6, enPromocion: false },
  { label: '10 porciones', price: 125000, points: 8, prepMinutes: 20, portions: 10, enPromocion: false },
  { label: '15 porciones', price: 170000, points: 10, prepMinutes: 20, portions: 15, enPromocion: false },
  { label: '20 porciones', price: 210000, points: 12, prepMinutes: 20, portions: 20, enPromocion: false },
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
  const args = process.argv.slice(2);
  if (!args.includes('--yes')) {
    console.error('Refusing to run without --yes.');
    process.exitCode = 1;
    return;
  }
  const folderNumbers = args.filter((a) => a !== '--yes');
  if (folderNumbers.length === 0) {
    console.error('Dime qué carpetas agregar, ej: --yes 1 2');
    process.exitCode = 1;
    return;
  }

  for (const designNumber of folderNumbers) {
    const dir = path.join(SOURCE_ROOT, designNumber);
    if (!fs.existsSync(dir)) throw new Error(`Source folder not found: ${dir}`);

    const files = fs
      .readdirSync(dir)
      .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
      .sort();
    if (files.length === 0) throw new Error(`No images found in ${dir}`);

    console.log(`Diseño ${designNumber}: subiendo ${files.length} foto(s)...`);
    const uploaded: { colorName: string; imageUrl: string }[] = [];
    for (const f of files) {
      const imageUrl = await uploadToCloudinary(path.join(dir, f));
      uploaded.push({ colorName: path.basename(f, path.extname(f)), imageUrl });
    }

    await prisma.productDesign.create({
      data: {
        name: '',
        category: ItemCategory.CAKE,
        shape: null,
        imageUrl: uploaded[0].imageUrl,
        allowsCustomImage: false,
        allowsCustomText: true,
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
        images: {
          create: uploaded.map((u) => ({ colorName: u.colorName, imageUrl: u.imageUrl })),
        },
      },
    });
    console.log(`  ✓ diseño ${designNumber} creado · colores: ${uploaded.map((u) => u.colorName).join(', ')}`);
  }

  console.log('\nListo.');
}

main()
  .catch((error) => {
    console.error('addCatalogDesigns28000 failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
