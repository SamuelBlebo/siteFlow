import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import { SiteProvider, useSite } from './src/site/SiteContext';
import { startOutbox } from './src/lib/reportOutbox';
import { startSync } from './src/lib/sync';
import { applySkin, colors } from './src/theme';
import ErrorBoundary from './src/components/ErrorBoundary';
import LoginScreen from './src/screens/LoginScreen';
import SitesScreen from './src/screens/SitesScreen';
import TodayScreen from './src/screens/TodayScreen';
import ReportScreen from './src/screens/ReportScreen';
import MaterialsScreen from './src/screens/MaterialsScreen';
import WorkersScreen from './src/screens/WorkersScreen';
import NoAccessScreen from './src/screens/NoAccessScreen';
import SetPasswordScreen from './src/screens/SetPasswordScreen';
import AccountScreen from './src/screens/AccountScreen';
import IssuesScreen from './src/screens/IssuesScreen';
import IssueScreen from './src/screens/IssueScreen';
import { DrawingScreen } from './src/components/SiteDrawing';
import ReportUpdateScreen from './src/screens/ReportUpdateScreen';
import SyncScreen from './src/screens/SyncScreen';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function SiteTabs({ route }) {
  return <SiteProvider sid={route.params.sid}><SiteTabBar /></SiteProvider>;
}

// Materials and Workers follow the company's modules
function SiteTabBar() {
  const { can } = useAuth();
  const { mod } = useSite();
  return (
      <Tabs.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.ink,
          tabBarActiveBackgroundColor: colors.brassSoft,
          tabBarInactiveTintColor: colors.muted,
          tabBarIcon: () => null,
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
          tabBarLabelStyle: { fontSize: 15, fontWeight: '600' },
          tabBarItemStyle: { justifyContent: 'center' },
        }}
      >
        <Tabs.Screen name="Today" component={TodayScreen} />
        {can('site.work') && <Tabs.Screen name="Report" component={ReportScreen} />}
        <Tabs.Screen name="Issues" component={IssuesScreen} />
        {mod('materials') && <Tabs.Screen name="Materials" component={MaterialsScreen} />}
        {mod('labour') && <Tabs.Screen name="Workers" component={WorkersScreen} />}
      </Tabs.Navigator>
  );
}

const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg, card: colors.surface, text: colors.ink, border: colors.line, primary: colors.ink } };

function Root() {
  const { user, active, profile, loading } = useAuth();
  // The person's skin, before anything below draws with the accent
  applySkin(profile?.skin);
  if (loading) {
    return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.steel} /></View>;
  }
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.ink, headerTitleStyle: { fontWeight: '700' }, headerShadowVisible: false, contentStyle: { backgroundColor: colors.bg } }}>
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
          <Stack.Screen name="Issue" component={IssueScreen} options={{ title: 'Issue' }} />
          <Stack.Screen name="Drawing" component={DrawingScreen} options={{ title: 'Project drawing' }} />
          <Stack.Screen name="ReportUpdate" component={ReportUpdateScreen} options={{ title: 'Update report' }} />
          <Stack.Screen name="Sync" component={SyncScreen} options={{ title: 'Sync' }} />
          <Stack.Screen name="Site" component={SiteTabs} options={({ route }) => ({ title: route.params.name })} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  useEffect(() => startOutbox(), []);
  useEffect(() => {
    let stop = () => {};
    startSync().then((unsub) => { stop = unsub; });
    return () => stop();
  }, []);
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer theme={navTheme}>
          <StatusBar style="dark" />
          <ErrorBoundary>
            <Root />
          </ErrorBoundary>
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
