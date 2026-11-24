-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "unitsAtOrder" INTEGER;

-- CreateTable
CREATE TABLE "AlfajorQuantity" (
    "id" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "prepMinutes" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlfajorQuantity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlfajorBox" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlfajorBox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlfajorBoxPrice" (
    "boxId" TEXT NOT NULL,
    "quantityId" TEXT NOT NULL,
    "sizeId" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "AlfajorBoxPrice_pkey" PRIMARY KEY ("boxId","quantityId","sizeId")
);

-- CreateIndex
CREATE UNIQUE INDEX "AlfajorQuantity_units_key" ON "AlfajorQuantity"("units");

-- CreateIndex
CREATE UNIQUE INDEX "AlfajorBox_name_key" ON "AlfajorBox"("name");

-- AddForeignKey
ALTER TABLE "AlfajorBoxPrice" ADD CONSTRAINT "AlfajorBoxPrice_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "AlfajorBox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlfajorBoxPrice" ADD CONSTRAINT "AlfajorBoxPrice_quantityId_fkey" FOREIGN KEY ("quantityId") REFERENCES "AlfajorQuantity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlfajorBoxPrice" ADD CONSTRAINT "AlfajorBoxPrice_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "CakeSize"("id") ON DELETE CASCADE ON UPDATE CASCADE;

