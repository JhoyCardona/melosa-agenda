-- User.pushToken: dropped along with the whole single-device Expo-push reminder
-- system (savePushToken endpoint, notifyTomorrowOrders.ts). It stored one token
-- per user, which can't support Melosa being logged in on multiple devices at
-- once, and nothing in the current mobile app registered it anymore anyway.
ALTER TABLE "User" DROP COLUMN "pushToken";
