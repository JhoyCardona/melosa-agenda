import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// One-off: remove leftover test orders from prod and prune any DaySchedule row
// that no longer has an order on it. Run inspectOrders.ts first and adjust
// TICKETS_TO_DELETE to match what you actually see.
//
//   npx ts-node src/scripts/cleanTestOrders.ts

const TICKETS_TO_DELETE = [37];

async function main() {
  const orders = await prisma.order.findMany({
    where: { ticketNumber: { in: TICKETS_TO_DELETE } },
    select: { id: true, ticketNumber: true, clientName: true, deliveryDate: true },
  });

  if (orders.length === 0) {
    console.log('No matching orders — nothing to delete.');
  } else {
    for (const o of orders) {
      console.log(`Deleting #${o.ticketNumber} (${o.clientName})`);
    }
    // OrderItem rows cascade on the FK.
    await prisma.order.deleteMany({ where: { ticketNumber: { in: TICKETS_TO_DELETE } } });
  }

  // Drop DaySchedule rows with no orders left on that date, so the timeline
  // starts clean. Safe while the public web is still closed.
  const days = await prisma.daySchedule.findMany();
  for (const d of days) {
    const count = await prisma.order.count({ where: { deliveryDate: d.date } });
    if (count === 0) {
      console.log(`Pruning empty DaySchedule ${d.date.toISOString().slice(0, 10)}`);
      await prisma.daySchedule.delete({ where: { id: d.id } });
    }
  }

  const remaining = await prisma.order.count();
  console.log(`Done. Orders remaining: ${remaining}`);
}

main()
  .catch((error) => {
    console.error('Error cleaning test orders:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
