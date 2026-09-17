-- New fixed flavor for the alfajor minicake (ALFAJOR_CAKE category) — not a
-- pickable option alongside Vainilla/Chocolate, just what that one design
-- always locks OrderItem.flavor to. Additive enum value, no data change.
ALTER TYPE "Flavor" ADD VALUE 'ALFAJOR';
