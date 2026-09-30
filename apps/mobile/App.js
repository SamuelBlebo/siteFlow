import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import { SiteProvider } from './src/site/SiteContext';
import { startUploadQueue } from './src/lib/uploadQueue';
import { startSync } from './src/lib/sync';
import { colors } from './src/theme';
import LoginScreen from './src/screens/LoginScreen';
import SitesScreen from './src/screens/SitesScreen';
import TodayScreen from './src/screens/TodayScreen';
import ReportScreen from './src/screens/ReportScreen';
import MaterialsScreen from './src/screens/MaterialsScreen';
import WorkersScreen from './src/screens/WorkersScreen';
import NoAccessScreen from './src/screens/NoAccessScreen';
import SetPasswordScreen from './src/screens/SetPasswordScreen';
import AccountScreen from './src/screens/AccountScreen';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function SiteTabs({ route }) {
  const { can } = useAuth();
  return (
    <SiteProvider sid={route.params.sid}>
      <Tabs.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.ink,
          tabBarInactiveTintColor: colors.muted,
          tabBarIcon: () => null,
          tabBarLabelStyle: { fontSize: 15, fontWeight: '600' },
          tabBarItemStyle: { justifyContent: 'center' },
        }}
      >
        <Tabs.Screen name="Today" component={TodayScreen} />
        {can('site.work') && <Tabs.Screen name="Report" component={ReportScreen} />}
        <Tabs.Screen name="Materials" component={MaterialsScreen} />
        <Tabs.Screen name="Workers" component={WorkersScreen} />
      </Tabs.Navigator>
    </SiteProvider>
  );
}

function Root() {
  const { user, active, profile, loading } = useAuth();
  if (loading) {
    return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.steel} /></View>;
  }
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.steel }, headerTintColor: '#fff' }}>
      {!user ? (
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      ) : !active ? (
        <Stack.Screen name="NoAccess" component={NoAccessScreen} options={{ title: 'SiteFlow' }} />
      ) : profile.mustChangePassword ? (
        <Stack.Screen name="SetPassword" component={SetPasswordScreen} options={{ title: 'SiteFlow' }} />
      ) : (
        <>
          <Stack.Screen name="Sites" component={SitesScreen} options={{ title: 'Your sites' }} />
          <Stack.Screen name="Account" component={AccountScreen} options={{ title: 'Your account' }} />
          <Stack.Screen name="Site" component={SiteTabs} options={({ route }) => ({ title: route.params.name })} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  useEffect(() => startUploadQueue(), []);
  useEffect(() => {
    let stop = () => {};
    startSync().then((unsub) => { stop = unsub; });
    return () => stop();
  }, []);
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <StatusBar style="light" />
          <Root />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
