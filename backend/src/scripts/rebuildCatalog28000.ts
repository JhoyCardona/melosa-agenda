import fs from 'fs';
import path from 'path';
import { PrismaClient, ItemCategory } from '@prisma/client';
import cloudinary from '../config/cloudinary';

const prisma = new PrismaClient();

// One-off: wipe the whole catalog and rebuild it from the client's organised
// $28.000 minicake photo set. Every design is nameless and description-less on
// purpose — the photo is the identity, and it's the photo that shows up on the
// order. The source folder tree encodes design + color:
//
//   28000/<designNumber>/<colorName>.jpg  -> one ProductDesign per numbered
//   folder, one ProductDesignImage per file (colorName = filename without
//   extension). Shape and custom text are no longer folder-driven: shape is a
//   client pick on BookingPage (Redonda/Corazón), and every design here allows
//   custom text (20-letter cap still enforced server-side).
//
// Run it against prod the same way the earlier seed scripts were run:
//   npx ts-node src/scripts/rebuildCatalog28000.ts --yes

const SOURCE_ROOT =
  process.env.CATALOG_SOURCE_ROOT ??
  '/home/jhoyners-cardona/proyects/melosa/imagenes-promo-minicakes/28000';

// Same 5-size shape every design gets. Minicake (2 porciones) is the promo, at
// the real $28.000; the torta sizes keep the placeholder prices from
// seedMinicakePriceTiers.ts until gretica confirms the real ones from
// /admin/catalogo.
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

interface DesignFolder {
  designNumber: string;
  images: { colorName: string; absPath: string }[];
}

function collectDesignFolders(): DesignFolder[] {
  const entries = fs
    .readdirSync(SOURCE_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    // Numeric folder names sort as strings by default ("10" before "2") —
    // sort numerically so console output/order matches how gretica numbered them.
    .sort((a, b) => Number(a.name) - Number(b.name));

  const folders: DesignFolder[] = [];
  for (const entry of entries) {
    const dir = path.join(SOURCE_ROOT, entry.name);
    const files = fs
      .readdirSync(dir)
      .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
      .sort();
    if (files.length === 0) continue;
    folders.push({
      designNumber: entry.name,
      images: files.map((f) => ({
        colorName: path.basename(f, path.extname(f)),
        absPath: path.join(dir, f),
      })),
    });
  }
  return folders;
}

async function main() {
  if (!process.argv.includes('--yes')) {
    console.error(
      'Refusing to run without --yes. This DELETES every ProductDesign and rebuilds the catalog.'
    );
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(SOURCE_ROOT)) {
    throw new Error(`Source folder not found: ${SOURCE_ROOT}`);
  }

  const designFolders = collectDesignFolders();
  if (designFolders.length === 0) {
    throw new Error(`No design folders with images found under ${SOURCE_ROOT}`);
  }
  const totalImages = designFolders.reduce((sum, d) => sum + d.images.length, 0);
  console.log(`Found ${designFolders.length} design(s), ${totalImages} image(s) total.`);

  // Safety: never orphan order history. With FK onDelete: Restrict, a delete
  // would throw anyway, but this gives a clear message instead.
  const referenced = await prisma.orderItem.count({ where: { productDesignId: { not: null } } });
  if (referenced > 0) {
    throw new Error(
      `${referenced} order item(s) still reference a catalog design — aborting so history stays intact.`
    );
  }

  const deleted = await prisma.productDesign.deleteMany({});
  console.log(`Deleted ${deleted.count} existing ProductDesign row(s) (variants + images cascade).`);

  let createdDesigns = 0;
  let uploadedImages = 0;
  for (const folder of designFolders) {
    // Upload every color photo first so a mid-upload failure doesn't leave a
    // ProductDesign with a broken cover imageUrl.
    const uploaded: { colorName: string; imageUrl: string }[] = [];
    for (const img of folder.images) {
      const imageUrl = await uploadToCloudinary(img.absPath);
      uploaded.push({ colorName: img.colorName, imageUrl });
      uploadedImages += 1;
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
    createdDesigns += 1;
    console.log(
      `  [${createdDesigns}/${designFolders.length}] diseño ${folder.designNumber} · colores: ${uploaded.map((u) => u.colorName).join(', ')}`
    );
  }

  console.log(
    `\nDone. ${createdDesigns} design(s) created, ${uploadedImages} color image(s) uploaded. Todos con texto habilitado (máx. 20 letras).`
  );
}

main()
  .catch((error) => {
    console.error('rebuildCatalog28000 failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
