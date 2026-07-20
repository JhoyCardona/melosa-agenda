import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function sendPushNotification(pushToken: string, title: string, body: string) {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      to: pushToken,
      title,
      body,
      sound: 'default',
    }),
  });

  const result = await response.json();
  return result;
}

async function notifyTomorrowOrders() {
  const tomorrowStart = new Date();
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  tomorrowStart.setHours(0, 0, 0, 0);

  const tomorrowEnd = new Date(tomorrowStart);
  tomorrowEnd.setHours(23, 59, 59, 999);

  const ordersToNotify = await prisma.order.findMany({
    where: {
      status: 'PENDING',
      notifiedAt: null,
      deliveryDate: {
        gte: tomorrowStart,
        lte: tomorrowEnd,
      },
    },
  });

  if (ordersToNotify.length === 0) {
    console.log('No hay pedidos para notificar mañana.');
    return;
  }

  const user = await prisma.user.findFirst({ where: { pushToken: { not: null } } });

  if (!user || !user.pushToken) {
    console.log('No hay un push token guardado todavía. No se puede notificar.');
    return;
  }

  for (const order of ordersToNotify) {
    await sendPushNotification(
      user.pushToken,
      'Pedido para mañana',
      `${order.clientName} - entrega mañana`
    );

    await prisma.order.update({
      where: { id: order.id },
      data: { notifiedAt: new Date() },
    });

    console.log(`Notificado: pedido de ${order.clientName}`);
  }
}

notifyTomorrowOrders()
  .catch((error) => {
    console.error('Error notificando pedidos:', error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });