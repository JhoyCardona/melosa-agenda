import fs from 'fs';
import path from 'path';
import { PrismaClient, ItemCategory } from '@prisma/client';
import cloudinary from '../config/cloudinary';

const prisma = new PrismaClient();

// One-off: ADD $29.000 minicake designs, without touching anything already in
// the catalog. Same design+color folder structure as addCatalogDesigns28000,
// but split into two source subfolders that set different flags:
//
//   29000/solo_imagen/<designNumber>/<colorName>.jpg
//     -> allowsCustomImage + requiresCustomImage: true, allowsCustomText: false
//        (Melosa doesn't edit the print herself — client must supply it)
//   29000/texto_e_imagen/<designNumber>/<colorName>.jpg
//     -> same image requirement, PLUS allowsCustomText: true with a 10-letter
//        cap (shorter than the $28.000 catalog's 20, to fit the print)
//
//   npx ts-node src/scripts/addCatalogDesigns29000.ts --yes solo_imagen:1,2 texto_e_imagen:1,3,4,5

const SOURCE_ROOT =
  process.env.CATALOG_SOURCE_ROOT ??
  '/home/jhoyners-cardona/Downloads/promo-minickaes-melosa/29000';

const VARIANT_TEMPLATE = [
  { label: 'Minicake (2 porciones)', price: 29000, points: 4, prepMinutes: 20, portions: null, enPromocion: true },
  { label: '5 porciones', price: 60000, points: 6, prepMinutes: 20, portions: 5, enPromocion: false },
  { label: '10 porciones', price: 90000, points: 8, prepMinutes: 20, portions: 10, enPromocion: false },
  { label: '15 porciones', price: 120000, points: 10, prepMinutes: 20, portions: 15, enPromocion: false },
  { label: '20 porciones', price: 150000, points: 12, prepMinutes: 20, portions: 20, enPromocion: false },
];

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png']);

interface FolderKind {
  subDir: 'solo_imagen' | 'texto_e_imagen';
  allowsCustomText: boolean;
  customTextMaxLength: number;
}

const FOLDER_KINDS: FolderKind[] = [
  { subDir: 'solo_imagen', allowsCustomText: false, customTextMaxLength: 10 },
  { subDir: 'texto_e_imagen', allowsCustomText: true, customTextMaxLength: 10 },
];

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

// Parses "solo_imagen:1,2" / "texto_e_imagen:1,3,4,5" CLI args.
function parseArgs(args: string[]): Map<'solo_imagen' | 'texto_e_imagen', string[]> {
  const map = new Map<'solo_imagen' | 'texto_e_imagen', string[]>();
  for (const arg of args) {
    const [sub, nums] = arg.split(':');
    if ((sub === 'solo_imagen' || sub === 'texto_e_imagen') && nums) {
      map.set(sub, nums.split(',').map((n) => n.trim()).filter(Boolean));
    }
  }
  return map;
}

async function main() {
  const rawArgs = process.argv.slice(2);
  if (!rawArgs.includes('--yes')) {
    console.error('Refusing to run without --yes.');
    process.exitCode = 1;
    return;
  }
  const folderArgs = parseArgs(rawArgs.filter((a) => a !== '--yes'));
  if (folderArgs.size === 0) {
    console.error('Dime qué carpetas agregar, ej: --yes solo_imagen:1,2 texto_e_imagen:1,3,4,5');
    process.exitCode = 1;
    return;
  }

  for (const kind of FOLDER_KINDS) {
    const designNumbers = folderArgs.get(kind.subDir);
    if (!designNumbers) continue;

    for (const designNumber of designNumbers) {
      const dir = path.join(SOURCE_ROOT, kind.subDir, designNumber);
      if (!fs.existsSync(dir)) throw new Error(`Source folder not found: ${dir}`);

      const files = fs
        .readdirSync(dir)
        .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
        .sort();
      if (files.length === 0) throw new Error(`No images found in ${dir}`);

      console.log(`[${kind.subDir}] diseño ${designNumber}: subiendo ${files.length} foto(s)...`);
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
          allowsCustomImage: true,
          requiresCustomImage: true,
          allowsCustomText: kind.allowsCustomText,
          customTextMaxLength: kind.customTextMaxLength,
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
      console.log(
        `  ✓ diseño ${designNumber} creado · colores: ${uploaded.map((u) => u.colorName).join(', ')} · texto=${kind.allowsCustomText ? `sí (máx ${kind.customTextMaxLength})` : 'no'}`
      );
    }
  }

  console.log('\nListo.');
}

main()
  .catch((error) => {
    console.error('addCatalogDesigns29000 failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
