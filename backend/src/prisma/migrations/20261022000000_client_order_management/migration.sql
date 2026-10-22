-- CreateEnum
CREATE TYPE "ChangeActor" AS ENUM ('CLIENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "OrderChangeKind" AS ENUM ('MODIFIED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "accessToken" TEXT,
ADD COLUMN     "modifiedByClientAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OrderChange" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "actor" "ChangeActor" NOT NULL,
    "kind" "OrderChangeKind" NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientCredit" (
    "id" TEXT NOT NULL,
    "clientPhone" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "reason" TEXT NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientCredit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderChange_orderId_idx" ON "OrderChange"("orderId");

-- CreateIndex
CREATE INDEX "ClientCredit_clientPhone_idx" ON "ClientCredit"("clientPhone");

-- CreateIndex
CREATE UNIQUE INDEX "Order_accessToken_key" ON "Order"("accessToken");

-- AddForeignKey
ALTER TABLE "OrderChange" ADD CONSTRAINT "OrderChange_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

