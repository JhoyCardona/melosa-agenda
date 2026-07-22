import { Stack } from 'expo-router';
import { NewOrderProvider } from '../../../src/context/NewOrderContext';
import Header from '../../../src/components/Header';

export default function AddOrderLayout() {
  return (
    <NewOrderProvider>
      <Stack screenOptions={{ header: () => <Header /> }} />
    </NewOrderProvider>
  );
}