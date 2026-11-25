/**
 * NexusID Android wallet — app root.
 * Dark only (DESIGN.md). Providers: gesture handler (bottom sheet), safe area, navigation.
 *
 * @format
 */
import React from 'react';
import { StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DarkTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { RootNavigator } from './src/navigation/RootNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import { colors } from './src/styles/tokens';
import { ToastHost } from './src/ui';

const theme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.accent,
  },
};

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" />
        <NavigationContainer ref={navigationRef} theme={theme}>
          <RootNavigator />
        </NavigationContainer>
        <ToastHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
