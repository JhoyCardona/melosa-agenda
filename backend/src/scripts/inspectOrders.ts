import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Read-only. Prints every order and every DaySchedule row so we can decide what
// (if anything) is leftover test data to clean from prod. Deletes nothing.
//
//   npx ts-node src/scripts/inspectOrders.ts

function pad(value: unknown, width: number): string {
  return String(value ?? '').padEnd(width).slice(0, width);
}

async function main() {
  const orders = await prisma.order.findMany({
    orderBy: { ticketNumber: 'asc' },
    include: { _count: { select: { items: true } } },
  });

  console.log(`\n=== ORDERS (${orders.length}) ===`);
  if (orders.length > 0) {
    console.log(
      pad('#', 5) + pad('cliente', 20) + pad('estado', 18) + pad('entrega', 12) +
      pad('slot', 12) + pad('total', 10) + pad('abono', 10) + pad('origen', 12) + 'creado'
    );
    for (const o of orders) {
      const slot = `${o.deliveryStartMinutes}-${o.deliveryStartMinutes + o.deliveryDurationMin}`;
      console.log(
        pad(o.ticketNumber, 5) +
        pad(o.clientName, 20) +
        pad(o.status, 18) +
        pad(o.deliveryDate.toISOString().slice(0, 10), 12) +
        pad(slot, 12) +
        pad(o.totalPrice.toString(), 10) +
        pad(o.depositPaid.toString(), 10) +
        pad(o.source, 12) +
        o.createdAt.toISOString().slice(0, 16)
      );
    }
  }

  const days = await prisma.daySchedule.findMany({ orderBy: { date: 'asc' } });
  console.log(`\n=== DAY SCHEDULE (${days.length}) ===`);
  for (const d of days) {
    console.log(pad(d.date.toISOString().slice(0, 10), 12) + `cursor=${d.cursorMinutes}`);
  }
  console.log();
}

main()
  .catch((error) => {
    console.error('Error inspecting orders:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
