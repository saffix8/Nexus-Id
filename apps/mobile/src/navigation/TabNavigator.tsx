// apps/mobile/src/navigation/TabNavigator.tsx
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { CredentialListScreen } from '../screens/CredentialListScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { colors } from '../styles/tokens';

// 'Verify' tab has no standalone screen — it's driven by push notifications
// opening VerificationApprovalScreen as a modal (see notification.service.ts),
// so only 3 persistent tabs are registered here.
const Tab = createBottomTabNavigator();

export function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopColor: colors.borderSubtle,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: colors.accentPrimary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen name="Credentials" component={CredentialListScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
