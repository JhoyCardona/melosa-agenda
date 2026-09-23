-- CreateTable
CREATE TABLE "DesignImageLimit" (
    "designId" TEXT NOT NULL,
    "sizeId" TEXT NOT NULL,
    "maxImages" INTEGER NOT NULL,

    CONSTRAINT "DesignImageLimit_pkey" PRIMARY KEY ("designId","sizeId")
);

-- AddForeignKey
ALTER TABLE "DesignImageLimit" ADD CONSTRAINT "DesignImageLimit_designId_fkey" FOREIGN KEY ("designId") REFERENCES "ProductDesign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignImageLimit" ADD CONSTRAINT "DesignImageLimit_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "CakeSize"("id") ON DELETE CASCADE ON UPDATE CASCADE;

