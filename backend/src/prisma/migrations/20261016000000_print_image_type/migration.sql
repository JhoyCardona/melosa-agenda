-- CreateEnum
CREATE TYPE "PrintImageType" AS ENUM ('NON_EDIBLE', 'EDIBLE');

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "printImageType" "PrintImageType";
