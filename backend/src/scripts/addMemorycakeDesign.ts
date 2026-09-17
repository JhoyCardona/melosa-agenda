import fs from 'fs';
import path from 'path';
import { PrismaClient, ItemCategory } from '@prisma/client';
import cloudinary from '../config/cloudinary';

const prisma = new PrismaClient();

// One-off: create the "memory cake" design (31000+/memorycake/). Its
// peculiarity, per gretica's rules.txt: the number of print images (photo
// toppers) allowed depends on the size — up to 5 on the minicake/6-porciones,
// up to 10 on 10+ porciones. That's ProductVariant.maxCustomImages, read by
// publicOrderController.ts to cap OrderItem.customImageUrls.
//
// No color picker (single fixed decoration, like the alfajor design) and no
// custom text — rules.txt only calls out the image-count peculiarity.
// prepMinutes/points are NOT in rules.txt; defaulted to match the rest of the
// catalog (20 min flat) since assembling several toppers likely takes longer
// than a plain minicake — flag this to gretica and adjust if it's wrong.
//
//   npx ts-node src/scripts/addMemorycakeDesign.ts --yes

const SOURCE_PHOTO =
  process.env.MEMORYCAKE_SOURCE_PHOTO ??
  '/home/jhoyners-cardona/proyects/melosa/imagenes-promo-minicakes/31000+/memorycake/memorycake.jpeg';

const VARIANT_TEMPLATE = [
  { label: 'Minicake (2 porciones)', price: 31000, points: 4, prepMinutes: 20, portions: null, enPromocion: true, maxCustomImages: 5 },
  { label: '6 porciones', price: 77000, points: 6, prepMinutes: 20, portions: 6, enPromocion: false, maxCustomImages: 5 },
  { label: '10 porciones', price: 133000, points: 8, prepMinutes: 20, portions: 10, enPromocion: false, maxCustomImages: 10 },
  { label: '15 porciones', price: 184000, points: 10, prepMinutes: 20, portions: 15, enPromocion: false, maxCustomImages: 10 },
  { label: '20 porciones', price: 235000, points: 12, prepMinutes: 20, portions: 20, enPromocion: false, maxCustomImages: 10 },
];

async function uploadToCloudinary(absPath: string): Promise<string> {
  const buffer = fs.readFileSync(absPath);
  const mime = path.extname(absPath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
  const dataUri = `data:${mime};base64,${buffer.toString('base64')}`;
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
    console.error('Refusing to run without --yes.');
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(SOURCE_PHOTO)) {
    throw new Error(`Source photo not found: ${SOURCE_PHOTO}`);
  }

  console.log('Subiendo foto de referencia...');
  const imageUrl = await uploadToCloudinary(SOURCE_PHOTO);

  const design = await prisma.productDesign.create({
    data: {
      name: 'Memory Cake',
      category: ItemCategory.CAKE,
      shape: null,
      imageUrl,
      allowsCustomImage: true,
      requiresCustomImage: true,
      allowsCustomText: false,
      variants: {
        create: VARIANT_TEMPLATE.map((v) => ({
          label: v.label,
          price: v.price,
          points: v.points,
          prepMinutes: v.prepMinutes,
          ...(v.portions !== null && { portions: v.portions }),
          enPromocion: v.enPromocion,
          maxCustomImages: v.maxCustomImages,
        })),
      },
    },
    include: { variants: true },
  });

  console.log(`Listo. Diseño creado: ${design.id}`);
}

main()
  .catch((error) => {
    console.error('addMemorycakeDesign failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
