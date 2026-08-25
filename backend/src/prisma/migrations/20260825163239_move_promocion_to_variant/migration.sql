-- AlterTable
ALTER TABLE "ProductDesign" DROP COLUMN "enPromocion";

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "enPromocion" BOOLEAN NOT NULL DEFAULT false;

