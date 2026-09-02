import { Stack } from 'expo-router';
import Header from '../../src/components/Header';

export default function MainLayout() {
  return (
    <Stack screenOptions={{ header: () => <Header /> }}>
      <Stack.Screen name="home" options={{ header: () => <Header showBack={false} /> }} />
      <Stack.Screen name="calendar" options={{ headerShown: false }} />
      <Stack.Screen name="block-days/index" options={{ header: () => <Header /> }} />
      <Stack.Screen name="finished/index" options={{ header: () => <Header /> }} />
      <Stack.Screen name="notifications/index" options={{ header: () => <Header /> }} />
      <Stack.Screen name="search/index" options={{ header: () => <Header /> }} />
    </Stack>
  );
}