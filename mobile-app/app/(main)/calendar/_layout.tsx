import { Stack } from 'expo-router';
import Header from '../../../src/components/Header';

export default function CalendarLayout() {
  return <Stack screenOptions={{ header: () => <Header /> }} />;
}