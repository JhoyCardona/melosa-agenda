import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// One-off: wipe every order (and its DaySchedule cursors) from prod so real
// admin-created orders start from a clean slate. ticketNumber autoincrement is
// never reset (business rule — tickets stay unique forever), and BlockedDay
// rows are left untouched (not order data).
//
//   npx ts-node src/scripts/wipeAllOrders.ts

async function main() {
  const orderCount = await prisma.order.count();
  const itemCount = await prisma.orderItem.count();
  console.log(`Deleting ${orderCount} orders (${itemCount} items cascade)...`);
  await prisma.order.deleteMany({});

  const dayCount = await prisma.daySchedule.count();
  console.log(`Deleting ${dayCount} DaySchedule rows...`);
  await prisma.daySchedule.deleteMany({});

  console.log(`Done. Orders remaining: ${await prisma.order.count()}`);
  console.log(`DaySchedule rows remaining: ${await prisma.daySchedule.count()}`);
}

main()
  .catch((error) => {
    console.error('Error wiping orders:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
