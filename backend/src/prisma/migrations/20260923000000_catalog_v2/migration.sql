-- CreateEnum
CREATE TYPE "FlavorKind" AS ENUM ('BIZCOCHO', 'RELLENO');

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "prepMinutesAtOrder" INTEGER;

-- AlterTable
ALTER TABLE "ProductDesign" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CakeSize" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "portions" INTEGER NOT NULL,
    "prepMinutes" INTEGER NOT NULL,
    "requiresFullPayment" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CakeSize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CakeFlavor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "FlavorKind" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CakeFlavor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlavorSurcharge" (
    "flavorId" TEXT NOT NULL,
    "sizeId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,

    CONSTRAINT "FlavorSurcharge_pkey" PRIMARY KEY ("flavorId","sizeId")
);

-- CreateTable
CREATE TABLE "CakeShape" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CakeShape_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ColorSizePrice" (
    "colorId" TEXT NOT NULL,
    "sizeId" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "ColorSizePrice_pkey" PRIMARY KEY ("colorId","sizeId")
);

-- CreateTable
CREATE TABLE "_ColorFlavors" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ColorFlavors_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ColorShapes" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ColorShapes_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "CakeSize_label_key" ON "CakeSize"("label");

-- CreateIndex
CREATE UNIQUE INDEX "CakeSize_portions_key" ON "CakeSize"("portions");

-- CreateIndex
CREATE UNIQUE INDEX "CakeFlavor_kind_name_key" ON "CakeFlavor"("kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CakeShape_name_key" ON "CakeShape"("name");

-- CreateIndex
CREATE INDEX "_ColorFlavors_B_index" ON "_ColorFlavors"("B");

-- CreateIndex
CREATE INDEX "_ColorShapes_B_index" ON "_ColorShapes"("B");

-- AddForeignKey
ALTER TABLE "FlavorSurcharge" ADD CONSTRAINT "FlavorSurcharge_flavorId_fkey" FOREIGN KEY ("flavorId") REFERENCES "CakeFlavor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlavorSurcharge" ADD CONSTRAINT "FlavorSurcharge_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "CakeSize"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ColorSizePrice" ADD CONSTRAINT "ColorSizePrice_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "ProductDesignImage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ColorSizePrice" ADD CONSTRAINT "ColorSizePrice_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "CakeSize"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ColorFlavors" ADD CONSTRAINT "_ColorFlavors_A_fkey" FOREIGN KEY ("A") REFERENCES "CakeFlavor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ColorFlavors" ADD CONSTRAINT "_ColorFlavors_B_fkey" FOREIGN KEY ("B") REFERENCES "ProductDesignImage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ColorShapes" ADD CONSTRAINT "_ColorShapes_A_fkey" FOREIGN KEY ("A") REFERENCES "CakeShape"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ColorShapes" ADD CONSTRAINT "_ColorShapes_B_fkey" FOREIGN KEY ("B") REFERENCES "ProductDesignImage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

