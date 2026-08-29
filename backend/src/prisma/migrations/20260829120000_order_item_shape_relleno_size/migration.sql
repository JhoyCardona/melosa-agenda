-- OrderItem: shape and filling become mandatory on every new order (enforced in
-- the controllers, not at the DB level, so existing rows stay valid). customSize
-- is the free-text portions for a fully custom line ("torta personalizada") —
-- catalog lines keep using variant.label for their size.
ALTER TABLE "OrderItem" ADD COLUMN "shape" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "relleno" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "customSize" TEXT;
