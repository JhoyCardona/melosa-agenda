import fs from 'fs';
import path from 'path';
import { PrismaClient, ItemCategory } from '@prisma/client';
import cloudinary from '../config/cloudinary';

const prisma = new PrismaClient();

// One-off (Sep 21 2026): bring the DB in line with gretica's reorganised photo
// folders — new colors added to existing designs, photos replaced under the same
// color name, and one brand-new design. Each folder is matched to its DB design
// by an explicit id prefix (the folders carry no id, the mapping was worked out
// by comparing color sets + image content against what's on Cloudinary).
//
// Default is a dry run. Flags:
//   --yes    apply additions + replaced photos + the new design
//   --prune  ALSO delete colors that no longer exist in the folder, and the two
//            designs whose folders are gone/merged (only if they have no orders)
//
//   npx ts-node src/scripts/syncCatalogPhotos.ts            # dry run
//   npx ts-node src/scripts/syncCatalogPhotos.ts --yes
//   npx ts-node src/scripts/syncCatalogPhotos.ts --yes --prune

const PHOTOS_ROOT =
  process.env.CATALOG_SOURCE_ROOT ?? '/home/jhoyners-cardona/proyects/melosa/imagenes-promo-minicakes';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png']);

// folder (relative to PHOTOS_ROOT) -> design id prefix. Only folders whose
// design already exists in the DB.
const FOLDER_TO_DESIGN: Record<string, string> = {
  '28000/1': '69cf7e7f',
  '28000/11': '2b7a14a4',
  '28000/18': '946a1336',
  '28000/22': '911267e3',
  '28000/23': '56eebfa1',
  '30000/solo_imagen/1': '37c7d0e5',
  '30000/texto_e_imagen/4': 'f266dfb0',
  '30000/texto_e_imagen/6': 'f17cfc28',
  '30000/texto_e_imagen/7': 'dabee735',
  '30000/texto_e_imagen/8': '7550b695',
};

// Same color name, different photo (gretica re-edited it) -> re-upload + update.
const CHANGED: Record<string, string[]> = {
  '30000/texto_e_imagen/6': ['azul'],
  '30000/texto_e_imagen/8': ['amarillo'],
};

// File names that are typos — the color name is customer-facing.
const COLOR_ALIASES: Record<string, string> = { 'aul claro': 'azul claro' };

// A "new" color whose photo is identical to one already on Cloudinary under
// another design/color: reuse that URL instead of uploading a duplicate.
//   folder:color -> [design id prefix, color name]
const REUSE: Record<string, [string, string]> = {
  '28000/23:rojo': ['56eebfa1', 'reojo'], // "reojo" typo renamed to "rojo", same photo
  '30000/solo_imagen/1:rojo': ['ce57c2b6', 'rojo'], // old solo_imagen/2 merged into /1
};

// Folders that no longer exist / were merged into another one.
const ORPHAN_DESIGNS = ['431f6fd8' /* 28000/17 */, 'ce57c2b6' /* solo_imagen/2 -> /1 */];

// Brand-new design (same shape as addCatalogDesigns28000).
const NEW_DESIGN_FOLDER = '28000/25';
const NEW_DESIGN_VARIANTS = [
  { label: 'Minicake (2 porciones)', price: 28000, points: 4, prepMinutes: 20, portions: null, enPromocion: true },
  { label: '6 porciones', price: 73000, points: 6, prepMinutes: 20, portions: 6, enPromocion: false },
  { label: '10 porciones', price: 125000, points: 8, prepMinutes: 20, portions: 10, enPromocion: false },
  { label: '15 porciones', price: 170000, points: 10, prepMinutes: 20, portions: 15, enPromocion: false },
  { label: '20 porciones', price: 210000, points: 12, prepMinutes: 20, portions: 20, enPromocion: false },
];

function mimeFor(file: string): string {
  return path.extname(file).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
}

async function uploadToCloudinary(absPath: string): Promise<string> {
  const buffer = fs.readFileSync(absPath);
  const dataUri = `data:${mimeFor(absPath)};base64,${buffer.toString('base64')}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    folder: 'melosa-agenda',
    transformation: [{ width: 1200, crop: 'limit' }, { quality: 'auto' }, { fetch_format: 'auto' }],
  });
  return result.secure_url;
}

function localColors(folder: string): { color: string; file: string }[] {
  const dir = path.join(PHOTOS_ROOT, folder);
  if (!fs.existsSync(dir)) throw new Error(`Source folder not found: ${dir}`);
  return fs
    .readdirSync(dir)
    .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
    .sort()
    .map((f) => {
      const raw = path.basename(f, path.extname(f));
      return { color: COLOR_ALIASES[raw] ?? raw, file: path.join(dir, f) };
    });
}

async function findDesign(prefix: string) {
  const matches = await prisma.productDesign.findMany({
    where: { id: { startsWith: prefix } },
    include: { images: true, _count: { select: { orderItems: true } } },
  });
  if (matches.length !== 1) throw new Error(`Design prefix ${prefix} matched ${matches.length} rows`);
  return matches[0];
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--yes');
  const prune = args.includes('--prune');
  console.log(apply ? `APPLYING${prune ? ' (with prune)' : ''}\n` : 'DRY RUN (add --yes to apply)\n');

  for (const [folder, prefix] of Object.entries(FOLDER_TO_DESIGN)) {
    const design = await findDesign(prefix);
    const local = localColors(folder);
    const dbByColor = new Map(design.images.map((i) => [i.colorName, i]));
    const localNames = new Set(local.map((l) => l.color));
    const replaced = new Set(CHANGED[folder] ?? []);

    console.log(`${folder}  ->  ${design.id.slice(0, 8)}`);
    let coverUrl = design.imageUrl;
    let coverStale = false;

    for (const { color, file } of local) {
      const existing = dbByColor.get(color);
      if (existing && !replaced.has(color)) continue;

      let url: string;
      const reuse = REUSE[`${folder}:${color}`];
      if (reuse) {
        const src = await findDesign(reuse[0]);
        const srcImg = src.images.find((i) => i.colorName === reuse[1]);
        if (!srcImg) throw new Error(`Reuse source ${reuse.join('/')} not found`);
        url = srcImg.imageUrl;
      } else {
        url = apply ? await uploadToCloudinary(file) : '(would upload)';
      }

      if (existing) {
        console.log(`  ~ replace photo: ${color}`);
        if (apply) await prisma.productDesignImage.update({ where: { id: existing.id }, data: { imageUrl: url } });
        if (existing.imageUrl === design.imageUrl) {
          coverUrl = url;
          coverStale = true;
        }
      } else {
        console.log(`  + add color: ${color}${reuse ? ' (reusing existing photo)' : ''}`);
        if (apply) {
          await prisma.productDesignImage.create({ data: { productDesignId: design.id, colorName: color, imageUrl: url } });
        }
      }
    }

    for (const img of design.images) {
      if (localNames.has(img.colorName)) continue;
      if (!prune) {
        console.log(`  ? stale color kept (use --prune to delete): ${img.colorName}`);
        continue;
      }
      console.log(`  - remove color: ${img.colorName}`);
      if (apply) await prisma.productDesignImage.delete({ where: { id: img.id } });
      if (img.imageUrl === design.imageUrl) coverStale = true;
    }

    if (coverStale && apply) {
      if (coverUrl === design.imageUrl) {
        const first = await prisma.productDesignImage.findFirst({
          where: { productDesignId: design.id },
          orderBy: { colorName: 'asc' },
        });
        coverUrl = first?.imageUrl ?? null;
      }
      await prisma.productDesign.update({ where: { id: design.id }, data: { imageUrl: coverUrl } });
      console.log('  ~ cover updated');
    }
  }

  // Brand-new design
  console.log(`\n${NEW_DESIGN_FOLDER}  ->  NEW design`);
  const newLocal = localColors(NEW_DESIGN_FOLDER);
  const alreadyThere = await prisma.productDesignImage.findFirst({
    where: { colorName: newLocal[0].color, productDesign: { createdAt: { gte: new Date('2026-09-21T00:00:00-05:00') } } },
  });
  if (alreadyThere) {
    console.log('  (already created today — skipping)');
  } else {
    console.log(`  + create design with colors: ${newLocal.map((l) => l.color).join(', ')}`);
    if (apply) {
      const uploaded: { colorName: string; imageUrl: string }[] = [];
      for (const l of newLocal) uploaded.push({ colorName: l.color, imageUrl: await uploadToCloudinary(l.file) });
      await prisma.productDesign.create({
        data: {
          name: '',
          category: ItemCategory.CAKE,
          shape: null,
          imageUrl: uploaded[0].imageUrl,
          allowsCustomImage: false,
          allowsCustomText: true,
          variants: {
            create: NEW_DESIGN_VARIANTS.map((v) => ({
              label: v.label,
              price: v.price,
              points: v.points,
              prepMinutes: v.prepMinutes,
              ...(v.portions !== null && { portions: v.portions }),
              enPromocion: v.enPromocion,
            })),
          },
          images: { create: uploaded },
        },
      });
    }
  }

  // Orphan designs
  console.log('');
  for (const prefix of ORPHAN_DESIGNS) {
    const d = await findDesign(prefix);
    const label = `orphan design ${d.id.slice(0, 8)} (${d.images.map((i) => i.colorName).join(', ')}, ${d._count.orderItems} orders)`;
    if (!prune) {
      console.log(`  ? ${label} kept (use --prune to delete)`);
    } else if (d._count.orderItems > 0) {
      console.log(`  ! ${label} has orders — NOT deleted`);
    } else {
      console.log(`  - delete ${label}`);
      if (apply) await prisma.productDesign.delete({ where: { id: d.id } });
    }
  }

  console.log('\nListo.');
}

main()
  .catch((error) => {
    console.error('syncCatalogPhotos failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
