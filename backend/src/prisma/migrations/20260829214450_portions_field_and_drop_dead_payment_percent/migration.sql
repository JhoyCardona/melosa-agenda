-- ProductVariant.portions: explicit portion count (5/10/15/20...), replaces
-- label-text parsing as the source of truth for the premium-relleno surcharge
-- lookup. Nullable — not every variant is sold by portions (e.g. minicakes).
ALTER TABLE "ProductVariant" ADD COLUMN "portions" INTEGER;

-- ProductDesign.requiredPaymentPercent: dead field. It was settable via the
-- catalog API (never exposed in the admin UI) but the real deposit-percent rule
-- (pricing.ts's computeRequiredPaymentPercent) never read it — always used the
-- "lone minicake => 100%, else 50%" cart-level rule instead.
ALTER TABLE "ProductDesign" DROP COLUMN "requiredPaymentPercent";
