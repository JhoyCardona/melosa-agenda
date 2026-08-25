/*
  Warnings:

  - Added the required column `flavor` to the `OrderItem` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Flavor" AS ENUM ('VAINILLA', 'CHOCOLATE');

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "flavor" "Flavor" NOT NULL;

-- AlterTable
ALTER TABLE "ProductDesign" ADD COLUMN     "shape" TEXT;
