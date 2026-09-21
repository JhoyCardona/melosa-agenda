-- Variant "options" (the gatitos minicake: 1 gato / 3 gatos): a client choice
-- that changes price + photo but isn't a color. All additive and nullable, so
-- every existing design/variant keeps behaving exactly as before.
ALTER TABLE "ProductDesign" ADD COLUMN "optionTitle" TEXT;
ALTER TABLE "ProductVariant" ADD COLUMN "optionLabel" TEXT;
ALTER TABLE "ProductVariant" ADD COLUMN "imageUrl" TEXT;
