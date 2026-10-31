-- Alfajor cakes get their own sizes, flavors and shapes, separate from cakes.
-- Additive: every existing row becomes CAKE (the default), so the live cake
-- catalog and past orders are untouched. Uniqueness is now per product line.

-- AlterTable
ALTER TABLE "CakeSize" ADD COLUMN "category" "ItemCategory" NOT NULL DEFAULT 'CAKE';
ALTER TABLE "CakeFlavor" ADD COLUMN "category" "ItemCategory" NOT NULL DEFAULT 'CAKE';
ALTER TABLE "CakeShape" ADD COLUMN "category" "ItemCategory" NOT NULL DEFAULT 'CAKE';

-- DropIndex
DROP INDEX "CakeSize_label_key";
DROP INDEX "CakeSize_portions_key";
DROP INDEX "CakeFlavor_kind_name_key";
DROP INDEX "CakeShape_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "CakeSize_category_label_key" ON "CakeSize"("category", "label");
CREATE UNIQUE INDEX "CakeSize_category_portions_key" ON "CakeSize"("category", "portions");
CREATE UNIQUE INDEX "CakeFlavor_category_kind_name_key" ON "CakeFlavor"("category", "kind", "name");
CREATE UNIQUE INDEX "CakeShape_category_name_key" ON "CakeShape"("category", "name");
