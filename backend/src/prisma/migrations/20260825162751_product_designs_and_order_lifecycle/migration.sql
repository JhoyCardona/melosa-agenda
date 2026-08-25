-- CreateEnum
CREATE TYPE "TimeBlock" AS ENUM ('SLOT_14_15', 'SLOT_15_16', 'SLOT_16_17', 'SLOT_17_18', 'SLOT_18_19');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('WEB_PUBLIC', 'MANUAL');

-- AlterEnum
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('PENDING_REVIEW', 'AWAITING_PAYMENT', 'DEPOSIT_PAID', 'FULLY_PAID', 'COMPLETED', 'CANCELLED', 'EXPIRED');
ALTER TABLE "public"."Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "public"."OrderStatus_old";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PENDING_REVIEW';
COMMIT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentDueDate" TIMESTAMP(3),
ADD COLUMN     "requiredPaymentPercent" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "source" "OrderSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "ticketNumber" SERIAL NOT NULL,
ADD COLUMN     "timeBlock" "TimeBlock" NOT NULL,
ALTER COLUMN "deliveryDate" SET DATA TYPE DATE,
ALTER COLUMN "status" SET DEFAULT 'PENDING_REVIEW';

-- AlterTable
ALTER TABLE "OrderItem" DROP COLUMN "category",
DROP COLUMN "details",
DROP COLUMN "imageUrl",
DROP COLUMN "price",
ADD COLUMN     "customImageUrl" TEXT,
ADD COLUMN     "customText" TEXT,
ADD COLUMN     "pointsAtOrder" INTEGER NOT NULL,
ADD COLUMN     "priceAtOrder" DECIMAL(65,30) NOT NULL,
ADD COLUMN     "productDesignId" TEXT NOT NULL,
ADD COLUMN     "variantId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "ProductDesign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ItemCategory" NOT NULL,
    "imageUrl" TEXT,
    "enPromocion" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductDesign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productDesignId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeSlotUsage" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "timeBlock" "TimeBlock" NOT NULL,
    "pointsUsed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TimeSlotUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TimeSlotUsage_date_timeBlock_key" ON "TimeSlotUsage"("date", "timeBlock");

-- CreateIndex
CREATE UNIQUE INDEX "Order_ticketNumber_key" ON "Order"("ticketNumber");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productDesignId_fkey" FOREIGN KEY ("productDesignId") REFERENCES "ProductDesign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productDesignId_fkey" FOREIGN KEY ("productDesignId") REFERENCES "ProductDesign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

