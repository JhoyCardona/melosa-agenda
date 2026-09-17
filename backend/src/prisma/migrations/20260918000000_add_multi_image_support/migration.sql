-- Support for designs whose variant allows more than one print image (the
-- memory cake: up to 5 toppers on the minicake/6-porciones, up to 10 on
-- 10+ porciones). Both additive with safe defaults — existing rows keep
-- today's single-image behavior (maxCustomImages=1, customImageUrls=[]).
ALTER TABLE "ProductVariant" ADD COLUMN "maxCustomImages" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "OrderItem" ADD COLUMN "customImageUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
