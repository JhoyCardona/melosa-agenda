import fs from 'fs';
import path from 'path';
import { PrismaClient, ItemCategory } from '@prisma/client';
import cloudinary from '../config/cloudinary';

const prisma = new PrismaClient();

// One-off: create the "gatitos" minicake (31000+/Gatitos/). Per gretica's
// rules.txt the price depends on how many cats the client picks (1 gato $34.000,
// 3 gatos $38.000) and each count has its own photo, but it must behave as ONE
// minicake in the catalog: the client picks the count on the booking page and
// the photo + price swap. That's ProductVariant.optionLabel/imageUrl plus
// ProductDesign.optionTitle — see the schema comments.
//
// Only the minicake size for now: rules.txt says "minicake y 6 porciones" but
// gives no 6-porciones prices, and tortas 6+ aren't bookable on the site yet
// anyway. Add those variants (portions: 6, one per count) once she sends prices.
// No colors yet (a color picker will be layered on later, per option).
// prepMinutes/points not in rules.txt — defaulted like every other minicake.
//
//   npx ts-node src/scripts/addGatitosDesign.ts --yes

const SOURCE_ROOT =
  process.env.GATITOS_SOURCE_ROOT ??
  '/home/jhoyners-cardona/proyects/melosa/imagenes-promo-minicakes/31000+/Gatitos';

const OPTIONS = [
  { optionLabel: '1 gato', file: '1 gato/1 gatito.jpeg', price: 34000 },
  { optionLabel: '3 gatos', file: '3 gatos/3 gatitos.jpeg', price: 38000 },
];

async function uploadToCloudinary(absPath: string): Promise<string> {
  const buffer = fs.readFileSync(absPath);
  const mime = path.extname(absPath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
  const dataUri = `data:${mime};base64,${buffer.toString('base64')}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    folder: 'melosa-agenda',
    transformation: [{ width: 1200, crop: 'limit' }, { quality: 'auto' }, { fetch_format: 'auto' }],
  });
  return result.secure_url;
}

async function main() {
  if (!process.argv.includes('--yes')) {
    console.error('Refusing to run without --yes.');
    process.exitCode = 1;
    return;
  }
  if (await prisma.productDesign.findFirst({ where: { name: 'Gatitos' } })) {
    throw new Error('Ya existe un diseño "Gatitos" — bórralo primero si quieres recrearlo.');
  }

  const photos: { optionLabel: string; price: number; imageUrl: string }[] = [];
  for (const o of OPTIONS) {
    const abs = path.join(SOURCE_ROOT, o.file);
    if (!fs.existsSync(abs)) throw new Error(`Source photo not found: ${abs}`);
    console.log(`Subiendo ${o.optionLabel}...`);
    photos.push({ optionLabel: o.optionLabel, price: o.price, imageUrl: await uploadToCloudinary(abs) });
  }

  const design = await prisma.productDesign.create({
    data: {
      name: 'Gatitos',
      category: ItemCategory.CAKE,
      shape: null,
      imageUrl: photos[0].imageUrl,
      allowsCustomImage: false,
      allowsCustomText: true,
      optionTitle: 'Cantidad de gatos',
      variants: {
        create: photos.map((p) => ({
          label: `Minicake (2 porciones) · ${p.optionLabel}`,
          price: p.price,
          points: 4,
          prepMinutes: 20,
          enPromocion: true,
          optionLabel: p.optionLabel,
          imageUrl: p.imageUrl,
        })),
      },
    },
    include: { variants: true },
  });

  console.log(`Listo. Diseño creado: ${design.id} (${design.variants.length} variantes)`);
}

main()
  .catch((error) => {
    console.error('addGatitosDesign failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
