import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

// Decide the entry screen from whether a token is already stored, so the daily
// user isn't asked for the password on every launch. A stale/expired token still
// gets caught later by the 401 interceptor, which bounces back to /login.
export default function Index() {
  const [target, setTarget] = useState<'/(main)/home' | '/login' | null>(null);

  useEffect(() => {
    let alive = true;
    SecureStore.getItemAsync('authToken')
      .then((token) => {
        if (alive) setTarget(token ? '/(main)/home' : '/login');
      })
      .catch(() => {
        if (alive) setTarget('/login');
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!target) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#C82333" />
      </View>
    );
  }

  return <Redirect href={target} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5EBE0' },
});
