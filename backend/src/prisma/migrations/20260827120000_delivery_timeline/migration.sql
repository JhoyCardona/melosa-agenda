-- Delivery timeline model: replace the fixed 1-hour blocks (12 points each) with
-- a continuous per-day minute timeline, 2:00pm-7:00pm.
--
-- Every existing order is test data (confirmed with the client) and is removed
-- here. The product catalog (ProductDesign / ProductVariant) and the login user
-- are kept.

-- Wipe test orders.
DELETE FROM "OrderItem";
DELETE FROM "Order";

-- ProductVariant: how many minutes of the delivery timeline this variant uses.
ALTER TABLE "ProductVariant" ADD COLUMN "prepMinutes" INTEGER NOT NULL DEFAULT 20;

-- Order: drop the block, add the timeline slot (safe as NOT NULL with no default
-- because the table was just emptied).
ALTER TABLE "Order" DROP COLUMN "timeBlock";
ALTER TABLE "Order" ADD COLUMN "deliveryStartMinutes" INTEGER NOT NULL;
ALTER TABLE "Order" ADD COLUMN "deliveryDurationMin" INTEGER NOT NULL;

-- Replace the per-block point counter with a per-day forward-only cursor.
DROP TABLE "TimeSlotUsage";

CREATE TABLE "DaySchedule" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "cursorMinutes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DaySchedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DaySchedule_date_key" ON "DaySchedule"("date");

-- Retire the enum now that nothing references it.
DROP TYPE "TimeBlock";
