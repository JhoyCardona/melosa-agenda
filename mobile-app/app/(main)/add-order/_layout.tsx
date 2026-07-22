import { Stack } from 'expo-router';
import { NewOrderProvider } from '../../../src/context/NewOrderContext';

export default function AddOrderLayout() {
  return (
    <NewOrderProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </NewOrderProvider>
  );
}