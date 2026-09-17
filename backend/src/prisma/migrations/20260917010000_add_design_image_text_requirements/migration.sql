-- $29.000 catalog: some designs require a client-uploaded print image
-- (Melosa doesn't edit prints herself) and cap custom text shorter than the
-- $28.000 catalog's 20-letter default. Both additive with safe defaults —
-- existing rows get requiresCustomImage=false, customTextMaxLength=20 (no
-- behavior change for them).
ALTER TABLE "ProductDesign" ADD COLUMN "requiresCustomImage" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProductDesign" ADD COLUMN "customTextMaxLength" INTEGER NOT NULL DEFAULT 20;
