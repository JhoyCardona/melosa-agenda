-- Orders now enter AWAITING_PAYMENT on creation: the payment deadline
-- (pickup time - 24h) starts counting immediately and markExpiredOrders() can
-- act on them. Nothing lands in PENDING_REVIEW anymore (the enum value stays for
-- historical rows). Only the column default changes; existing rows are untouched.
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'AWAITING_PAYMENT';
