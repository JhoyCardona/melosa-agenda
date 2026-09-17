import fs from 'fs';
import path from 'path';
import { PrismaClient, ItemCategory } from '@prisma/client';
import cloudinary from '../config/cloudinary';

const prisma = new PrismaClient();

// One-off: create the single alfajor minicake ProductDesign. Unlike the
// 28000/30000 catalogs, this is ONE fixed design — no color picker (flavor,
// filling and decoration never change), only shape (Redonda/Corazón) is a
// client choice. requiresCustomImage/allowsCustomImage/allowsCustomText all
// stay false: the reference photo here IS the product, nothing to upload or
// type. See publicOrderController.ts for the relleno lock (ALFAJOR_CAKE
// category always forces Arequipe, on every size, not just the promo one).
//
//   npx ts-node src/scripts/addAlfajorMinicake.ts --yes

const SOURCE_PHOTO =
  process.env.ALFAJOR_SOURCE_PHOTO ??
  '/home/jhoyners-cardona/proyects/melosa/imagenes-promo-minicakes/minicake-alfajor/minicake-alfajor.jpeg';

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

  const existing = await prisma.productDesign.findFirst({
    where: { category: ItemCategory.ALFAJOR_CAKE },
  });
  if (existing) {
    throw new Error(
      `Ya existe un diseño ALFAJOR_CAKE (id ${existing.id}) — bórralo primero si quieres reemplazarlo.`
    );
  }

  console.log('Subiendo foto de referencia...');
  const imageUrl = await uploadToCloudinary(SOURCE_PHOTO);

  const design = await prisma.productDesign.create({
    data: {
      name: 'Minicake de alfajor',
      category: ItemCategory.ALFAJOR_CAKE,
      shape: null,
      imageUrl,
      allowsCustomImage: false,
      requiresCustomImage: false,
      allowsCustomText: false,
      variants: {
        create: [
          {
            label: 'Minicake (2 porciones)',
            price: 28000,
            points: 4,
            prepMinutes: 10,
            enPromocion: true,
          },
          {
            label: '6 porciones',
            price: 75000,
            points: 6,
            prepMinutes: 20,
            portions: 6,
            enPromocion: false,
          },
          {
            label: '10 porciones',
            price: 130000,
            points: 8,
            prepMinutes: 30,
            portions: 10,
            enPromocion: false,
          },
        ],
      },
    },
    include: { variants: true },
  });

  console.log(`Listo. Diseño creado: ${design.id}`);
}

main()
  .catch((error) => {
    console.error('addAlfajorMinicake failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
