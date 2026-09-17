-- Color/shape picker rework: a design (folder) now carries one photo per
-- color, and shape becomes a client pick at add-to-cart time instead of a
-- fixed ProductDesign field. Both additive/nullable — no backfill needed.

-- OrderItem: snapshot of the color the client picked (like `shape`/`relleno`).
ALTER TABLE "OrderItem" ADD COLUMN "color" TEXT;

-- One row per (design, color) photo. ProductDesign.imageUrl stays as the cover
-- photo for catalog grids; this table drives the color picker on BookingPage.
CREATE TABLE "ProductDesignImage" (
    "id" TEXT NOT NULL,
    "productDesignId" TEXT NOT NULL,
    "colorName" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductDesignImage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductDesignImage_productDesignId_colorName_key" ON "ProductDesignImage"("productDesignId", "colorName");

ALTER TABLE "ProductDesignImage" ADD CONSTRAINT "ProductDesignImage_productDesignId_fkey" FOREIGN KEY ("productDesignId") REFERENCES "ProductDesign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
