-- CreateEnum
CREATE TYPE "BlockType" AS ENUM ('VACATION', 'MANUAL_BLOCK');

-- CreateTable
CREATE TABLE "BlockedDay" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "BlockType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockedDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BlockedDay_date_key" ON "BlockedDay"("date");
