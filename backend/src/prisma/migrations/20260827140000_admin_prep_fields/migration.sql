-- Admin-panel foundations.

-- Per-design flag: does this design accept a custom text (phrase / number)?
-- Default true so existing designs keep behaving as before.
ALTER TABLE "ProductDesign" ADD COLUMN "allowsCustomText" BOOLEAN NOT NULL DEFAULT true;

-- The delivery timeline now counts minutes from MIDNIGHT (so the admin can place
-- orders at any clock time — mornings, late night — without negative offsets).
-- 840 = 2:00 p.m. = opening. No existing orders to backfill.
ALTER TABLE "DaySchedule" ALTER COLUMN "cursorMinutes" SET DEFAULT 840;
