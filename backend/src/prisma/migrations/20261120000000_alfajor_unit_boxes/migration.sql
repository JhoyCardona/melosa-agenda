-- Small alfajores (ALFAJOR_UNIT) run on the catalog v2 machinery: each design
-- is a box. Additive and nullable: every existing design keeps NULL in both
-- columns, so cakes, alfajor cakes and past orders are untouched.

-- AlterTable
ALTER TABLE "ProductDesign" ADD COLUMN "unitsPerBox" INTEGER;
ALTER TABLE "ProductDesign" ADD COLUMN "prepMinutes" INTEGER;
