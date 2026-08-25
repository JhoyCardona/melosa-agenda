import dotenv from 'dotenv';
import { PrismaClient, OrderStatus, OrderSource, TimeBlock, Flavor } from '@prisma/client';
import { computePaymentDueDate } from '../utils/colombiaTime';

dotenv.config();

const prisma = new PrismaClient();

const DATE = '2026-08-27';
const DATE_VALUE = new Date(`${DATE}T00:00:00.000Z`);

// Re-lays out 2026-08-27 so a Torta 5 porciones (6 pts) and a Torta 10 porciones
// (8 pts) fit alongside the existing 10 minicakes, without any block going over
// the 12-point cap:
//   SLOT_14_15: 1 minicake (4)  + Torta 10 (8)  = 12
//   SLOT_15_16: 1 minicake (4)  + Torta 5 (6)   = 10
//   SLOT_16_17: 3 minicakes (12)                = 12
//   SLOT_17_18: 3 minicakes (12)                = 12
//   SLOT_18_19: 2 minicakes (8)                 = 8
async function main() {
  const existing = await prisma.order.findMany({
    where: { deliveryDate: DATE_VALUE },
    include: { items: true },
  });

  if (existing.length === 0) {
    throw new Error(`No hay pedidos existentes para ${DATE} — corré primero seedSampleOrders.ts`);
  }

  const minicakeOrders = existing.filter((o) => o.items.some((i) => i.pointsAtOrder === 4));
  if (minicakeOrders.length !== 10) {
    throw new Error(`Se esperaban 10 pedidos de minicake para ${DATE}, hay ${minicakeOrders.length}`);
  }

  const newBlocks: TimeBlock[] = [
    TimeBlock.SLOT_14_15, // 1
    TimeBlock.SLOT_15_16, // 1
    TimeBlock.SLOT_16_17, // 2
    TimeBlock.SLOT_16_17,
    TimeBlock.SLOT_16_17, // 3rd
    TimeBlock.SLOT_17_18,
    TimeBlock.SLOT_17_18,
    TimeBlock.SLOT_17_18, // 3rd
    TimeBlock.SLOT_18_19,
    TimeBlock.SLOT_18_19,
  ];

  for (let i = 0; i < minicakeOrders.length; i++) {
    await prisma.order.update({ where: { id: minicakeOrders[i].id }, data: { timeBlock: newBlocks[i] } });
  }

  const corazon = await prisma.productDesign.findFirstOrThrow({ where: { name: 'Minicake Roja Corazón' } });
  const redonda = await prisma.productDesign.findFirstOrThrow({ where: { name: 'Minicake Azul Redonda' } });
  const corazonVariants = await prisma.productVariant.findMany({ where: { productDesignId: corazon.id } });
  const redondaVariants = await prisma.productVariant.findMany({ where: { productDesignId: redonda.id } });

  const torta5 = corazonVariants.find((v) => v.label === 'Torta 5 porciones')!;
  const torta10 = redondaVariants.find((v) => v.label === 'Torta 10 porciones')!;

  const now = new Date();

  const newOrders = [
    {
      clientName: 'Ricardo Salazar',
      clientPhone: '3066789012',
      timeBlock: TimeBlock.SLOT_15_16,
      productDesignId: corazon.id,
      variant: torta5,
      flavor: Flavor.CHOCOLATE,
    },
    {
      clientName: 'Manuela Prieto',
      clientPhone: '3077890123',
      timeBlock: TimeBlock.SLOT_14_15,
      productDesignId: redonda.id,
      variant: torta10,
      flavor: Flavor.VAINILLA,
    },
  ];

  for (const sample of newOrders) {
    const price = Number(sample.variant.price);
    const points = sample.variant.points;

    const order = await prisma.order.create({
      data: {
        clientName: sample.clientName,
        clientPhone: sample.clientPhone,
        deliveryDate: DATE_VALUE,
        timeBlock: sample.timeBlock,
        status: OrderStatus.AWAITING_PAYMENT,
        source: OrderSource.WEB_PUBLIC,
        totalPrice: price,
        paymentDueDate: computePaymentDueDate(DATE, now),
        notes: 'Pedido de prueba',
        items: {
          create: [
            {
              productDesignId: sample.productDesignId,
              variantId: sample.variant.id,
              priceAtOrder: price,
              pointsAtOrder: points,
              flavor: sample.flavor,
            },
          ],
        },
      },
    });
    console.log(`Pedido creado: #${order.ticketNumber} ${order.clientName} - ${sample.variant.label}`);
  }

  // Recompute TimeSlotUsage for this date from scratch — safer than incrementing,
  // since orders got reshuffled across blocks above.
  await prisma.timeSlotUsage.deleteMany({ where: { date: DATE_VALUE } });

  const allOrders = await prisma.order.findMany({
    where: { deliveryDate: DATE_VALUE, status: { not: OrderStatus.CANCELLED } },
    include: { items: true },
  });

  const pointsByBlock = new Map<TimeBlock, number>();
  for (const order of allOrders) {
    const points = order.items.reduce((sum, i) => sum + i.pointsAtOrder, 0);
    pointsByBlock.set(order.timeBlock, (pointsByBlock.get(order.timeBlock) ?? 0) + points);
  }

  for (const [timeBlock, pointsUsed] of pointsByBlock) {
    await prisma.timeSlotUsage.create({ data: { date: DATE_VALUE, timeBlock, pointsUsed } });
    console.log(`${timeBlock}: ${pointsUsed}/12 puntos`);
  }
}

main()
  .catch((error) => {
    console.error('Error agregando variedad de tamaños:', error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
