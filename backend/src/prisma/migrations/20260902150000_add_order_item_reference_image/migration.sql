-- OrderItem: reference/inspiration photo the client sent by WhatsApp ("quiero
-- algo así"). Kept separate from customImageUrl (edible-print artwork) so it
-- never leaks into the day's print ZIP (findDayImageItems). Nullable, additive —
-- existing rows stay NULL, no backfill required.
ALTER TABLE "OrderItem" ADD COLUMN "referenceImageUrl" TEXT;
