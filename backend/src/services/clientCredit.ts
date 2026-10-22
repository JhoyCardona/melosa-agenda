import { PrismaClient } from '@prisma/client';

// Saldo a favor (ClientCredit ledger) as the agenda sees it: the client's
// balance next to each of their orders, and gretica applying it to a payment.

const prisma = new PrismaClient();

// Same client whether the phone was typed "+57 300 123 4567" on one order and
// "3001234567" on another: compare the last 10 digits.
export function phoneKey(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

// Current balance per phone key. The ledger is tiny (one row per cancel /
// lowered total / use), so summing it whole is fine.
async function balancesByPhone(): Promise<Map<string, number>> {
  const rows = await prisma.clientCredit.groupBy({ by: ['clientPhone'], _sum: { amount: true } });
  const balances = new Map<string, number>();
  for (const row of rows) {
    const key = phoneKey(row.clientPhone);
    balances.set(key, (balances.get(key) ?? 0) + Number(row._sum.amount ?? 0));
  }
  return balances;
}

export async function creditBalance(phone: string): Promise<number> {
  return (await balancesByPhone()).get(phoneKey(phone)) ?? 0;
}

// Adds `clientCreditBalance` to each order (0 when the client has none).
export async function withCreditBalance<T extends { clientPhone: string }>(
  orders: T[]
): Promise<(T & { clientCreditBalance: number })[]> {
  if (orders.length === 0) return [];
  const balances = await balancesByPhone();
  return orders.map((o) => ({ ...o, clientCreditBalance: Math.max(0, balances.get(phoneKey(o.clientPhone)) ?? 0) }));
}
