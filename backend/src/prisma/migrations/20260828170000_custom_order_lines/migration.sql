-- OrderItem: allow fully custom lines (admin orders for personalized cakes that
-- aren't in the catalog). The catalog links and flavor become optional; two free
-- text columns carry the hand-typed values. priceAtOrder still holds the price
-- either way. The FKs keep ON DELETE RESTRICT (schema sets onDelete: Restrict),
-- so only the NOT NULL drops — no constraint recreation.
ALTER TABLE "OrderItem" ALTER COLUMN "productDesignId" DROP NOT NULL;
ALTER TABLE "OrderItem" ALTER COLUMN "variantId" DROP NOT NULL;
ALTER TABLE "OrderItem" ALTER COLUMN "flavor" DROP NOT NULL;
ALTER TABLE "OrderItem" ADD COLUMN "customName" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "customFlavor" TEXT;

-- ProductDesign: per-design deposit policy. An order snapshots the max across its
-- items into Order.requiredPaymentPercent (which already exists).
ALTER TABLE "ProductDesign" ADD COLUMN "requiredPaymentPercent" INTEGER NOT NULL DEFAULT 100;
