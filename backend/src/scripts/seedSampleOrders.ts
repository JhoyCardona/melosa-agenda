import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient, ItemCategory, OrderStatus, OrderSource, TimeBlock, Flavor } from '@prisma/client';
import cloudinary from '../config/cloudinary';
import { computePaymentDueDate } from '../utils/colombiaTime';

dotenv.config();

const prisma = new PrismaClient();

const IMAGES_DIR = '/home/jhoyners-cardona/Downloads/promo-minickaes-melosa/28000';

const DESIGNS_TO_SEED = [
  { file: 'roja-corazon.jpeg', name: 'Minicake Roja Corazón', shape: 'Corazón' },
  { file: 'blanca-rosada-corazon.jpeg', name: 'Minicake Blanca y Rosada', shape: 'Corazón' },
  { file: 'azul-redonda.jpeg', name: 'Minicake Azul Redonda', shape: 'Redonda' },
  { file: 'blanca-verde-dorada-redonda.jpeg', name: 'Minicake Verde y Dorada Redonda', shape: 'Redonda' },
];

const VARIANT_TEMPLATE = [
  { label: 'Minicake (2 porciones)', price: 15000, points: 4, enPromocion: true },
  { label: 'Torta 5 porciones', price: 15000, points: 6 },
  { label: 'Torta 10 porciones', price: 60000, points: 8 },
  { label: 'Torta 15 porciones', price: 90000, points: 10 },
  { label: 'Torta 20 porciones', price: 120000, points: 12 },
];

async function uploadImage(fileName: string): Promise<string> {
  const filePath = path.join(IMAGES_DIR, fileName);
  const result = await cloudinary.uploader.upload(filePath, {
    folder: 'melosa-agenda/designs',
    transformation: [{ width: 1200, crop: 'limit' }, { quality: 'auto' }, { fetch_format: 'auto' }],
  });
  return result.secure_url;
}

async function seedDesigns() {
  const designs = [];
  for (const { file, name, shape } of DESIGNS_TO_SEED) {
    const imageUrl = await uploadImage(file);
    const design = await prisma.productDesign.create({
      data: {
        name,
        category: ItemCategory.CAKE,
        shape,
        imageUrl,
        variants: { create: VARIANT_TEMPLATE },
      },
      include: { variants: true },
    });
    console.log(`ProductDesign creado: ${design.name} (${design.shape})`);
    designs.push(design);
  }
  return designs;
}

type Design = Awaited<ReturnType<typeof seedDesigns>>[number];

interface OrderItemInput {
  productDesignId: string;
  variantId: string;
  price: number;
  points: number;
  flavor: Flavor;
}

interface SampleOrder {
  clientName: string;
  clientPhone: string;
  deliveryDate: string;
  timeBlock: TimeBlock;
  status: OrderStatus;
  source: OrderSource;
  deliveryAddress?: string;
  notes?: string;
  depositPaid?: number;
  items: OrderItemInput[];
}

function itemOf(design: Design, label: string, flavor: Flavor): OrderItemInput {
  const variant = design.variants.find((v) => v.label === label)!;
  return {
    productDesignId: design.id,
    variantId: variant.id,
    price: Number(variant.price),
    points: variant.points,
    flavor,
  };
}

// deliveryDate must be a business day already (Mon-Sat, not a Colombian holiday) —
// picked by hand below for dates known to be plain weekdays.
async function seedOrders(designs: Design[]) {
  const [corazon1, corazon2, redonda1, redonda2] = designs;
  const now = new Date();

  const MINICAKE = 'Minicake (2 porciones)';
  const TORTA_10 = 'Torta 10 porciones';

  // 10 minicake orders on 2026-08-27, split so the day summary demo shows:
  // Corazón x5 (2 vainilla, 3 chocolate) + Redonda x5 (3 vainilla, 2 chocolate).
  const minicakeClients = [
    ['Laura Gómez', corazon1, Flavor.VAINILLA],
    ['Camila Ortiz', corazon1, Flavor.VAINILLA],
    ['Sofía Duarte', corazon2, Flavor.CHOCOLATE],
    ['Valentina Cruz', corazon2, Flavor.CHOCOLATE],
    ['Mariana Peña', corazon1, Flavor.CHOCOLATE],
    ['Isabella Rojas', redonda1, Flavor.VAINILLA],
    ['Daniela Vargas', redonda1, Flavor.VAINILLA],
    ['Gabriela Suárez', redonda2, Flavor.VAINILLA],
    ['Natalia Herrera', redonda2, Flavor.CHOCOLATE],
    ['Juliana Castro', redonda1, Flavor.CHOCOLATE],
  ] as const;

  const samples: SampleOrder[] = minicakeClients.map(([name, design, flavor], index) => ({
    clientName: name,
    clientPhone: `301${String(1000000 + index).padStart(7, '0')}`,
    deliveryDate: '2026-08-27',
    timeBlock: Object.values(TimeBlock)[index % 5],
    status: index === 0 ? OrderStatus.PENDING_REVIEW : OrderStatus.AWAITING_PAYMENT,
    source: OrderSource.WEB_PUBLIC,
    notes: 'Pedido de prueba',
    items: [itemOf(design, MINICAKE, flavor)],
  }));

  // A few extra orders on other days/sizes for variety in the calendar view.
  samples.push(
    {
      clientName: 'Fernanda Ríos',
      clientPhone: '3033456789',
      deliveryDate: '2026-08-28',
      timeBlock: TimeBlock.SLOT_16_17,
      status: OrderStatus.DEPOSIT_PAID,
      source: OrderSource.MANUAL,
      depositPaid: 30000,
      notes: 'Pedido de prueba - abono del 50% confirmado',
      items: [itemOf(redonda1, TORTA_10, Flavor.CHOCOLATE)],
    },
    {
      clientName: 'Andrés Torres',
      clientPhone: '3044567890',
      deliveryDate: '2026-08-31',
      timeBlock: TimeBlock.SLOT_17_18,
      status: OrderStatus.FULLY_PAID,
      source: OrderSource.WEB_PUBLIC,
      depositPaid: 90000,
      notes: 'Pedido de prueba - pagado completo',
      items: [itemOf(corazon2, TORTA_10, Flavor.VAINILLA)],
    },
    {
      clientName: 'Paula Méndez',
      clientPhone: '3055678901',
      deliveryDate: '2026-08-26',
      timeBlock: TimeBlock.SLOT_18_19,
      status: OrderStatus.EXPIRED,
      source: OrderSource.WEB_PUBLIC,
      notes: 'Pedido de prueba - venció el plazo de pago sin abonar',
      items: [itemOf(corazon1, MINICAKE, Flavor.CHOCOLATE)],
    }
  );

  for (const sample of samples) {
    const totalPrice = sample.items.reduce((sum, i) => sum + i.price, 0);
    const totalPoints = sample.items.reduce((sum, i) => sum + i.points, 0);
    const needsPaymentDueDate = sample.status !== OrderStatus.PENDING_REVIEW;
    const dateValue = new Date(`${sample.deliveryDate}T00:00:00.000Z`);

    const order = await prisma.order.create({
      data: {
        clientName: sample.clientName,
        clientPhone: sample.clientPhone,
        deliveryDate: dateValue,
        timeBlock: sample.timeBlock,
        deliveryAddress: sample.deliveryAddress ?? null,
        notes: sample.notes ?? null,
        status: sample.status,
        source: sample.source,
        totalPrice,
        depositPaid: sample.depositPaid ?? 0,
        paymentDueDate: needsPaymentDueDate ? computePaymentDueDate(sample.deliveryDate, now) : null,
        items: {
          create: sample.items.map((item) => ({
            productDesignId: item.productDesignId,
            variantId: item.variantId,
            priceAtOrder: item.price,
            pointsAtOrder: item.points,
            flavor: item.flavor,
          })),
        },
      },
    });

    await prisma.timeSlotUsage.upsert({
      where: { date_timeBlock: { date: dateValue, timeBlock: sample.timeBlock } },
      create: { date: dateValue, timeBlock: sample.timeBlock, pointsUsed: totalPoints },
      update: { pointsUsed: { increment: totalPoints } },
    });

    console.log(`Pedido creado: #${order.ticketNumber} ${order.clientName} (${order.status})`);
  }
}

async function main() {
  if (!fs.existsSync(IMAGES_DIR)) {
    throw new Error(`No se encontró la carpeta de imágenes: ${IMAGES_DIR}`);
  }
  const designs = await seedDesigns();
  await seedOrders(designs);
}

main()
  .catch((error) => {
    console.error('Error en el seed de datos de prueba:', error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
