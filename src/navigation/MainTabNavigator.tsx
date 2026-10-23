import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeScreen } from '@/screens/HomeScreen';
import { LeaveScreen } from '@/screens/LeaveScreen';
import { TasksScreen } from '@/screens/TasksScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { NotificationsScreen } from '@/screens/NotificationsScreen';
import { AttendanceScreen } from '@/screens/AttendanceScreen';
import { TripScreen } from '@/screens/TripScreen';
import { IssuesScreen } from '@/screens/IssuesScreen';
import { VehicleCheckScreen } from '@/screens/VehicleCheckScreen';
import { LiveMapScreen } from '@/screens/LiveMapScreen';
import { RoutePreviewScreen } from '@/screens/RoutePreviewScreen';
import { MessagesScreen } from '@/screens/MessagesScreen';
import { useTheme } from '@/theme';
import { TabBar } from '@/components/ui';
import type { MainStackParamList, MainTabParamList } from './types';

const Stack = createNativeStackNavigator<MainStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// Inner bottom-tab navigator using the custom floating TabBar.
// Attendance is reached from Home's "Tap to check in" card and Profile's
// "My attendance" button — both navigate to the 'Attendance' sibling route
// in the parent native-stack.
const TabsNavigator = () => {
  const { colors } = useTheme();
  return (
  <Tab.Navigator
    screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
    tabBar={(props) => <TabBar {...props} />}
  >
    <Tab.Screen name="Home" component={HomeScreen} />
    <Tab.Screen name="Tasks" component={TasksScreen} />
    <Tab.Screen name="Leave" component={LeaveScreen} />
    <Tab.Screen name="Inbox" component={MessagesScreen} />
    <Tab.Screen name="Me" component={ProfileScreen} />
  </Tab.Navigator>
  );
};

// Exported navigator: a native-stack wrapping the tabs + the Attendance overlay.
export const MainTabNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Tabs" component={TabsNavigator} />
    <Stack.Screen
      name="Attendance"
      component={AttendanceScreen}
      options={{ presentation: 'card', animation: 'slide_from_right' }}
    />
    <Stack.Screen
      name="Trip"
      component={TripScreen}
      options={{ presentation: 'card', animation: 'slide_from_right' }}
    />
    <Stack.Screen
      name="Issues"
      component={IssuesScreen}
      options={{ presentation: 'card', animation: 'slide_from_right' }}
    />
    <Stack.Screen
      name="VehicleCheck"
      component={VehicleCheckScreen}
      options={{ presentation: 'card', animation: 'slide_from_right' }}
    />
    <Stack.Screen
      name="LiveMap"
      component={LiveMapScreen}
      options={{ presentation: 'card', animation: 'slide_from_right' }}
    />
    <Stack.Screen
      name="RoutePreview"
      component={RoutePreviewScreen}
      options={{ presentation: 'card', animation: 'slide_from_right' }}
    />
    <Stack.Screen
      name="Notifications"
      component={NotificationsScreen}
      options={{ presentation: 'card', animation: 'slide_from_right' }}
    />
  </Stack.Navigator>
);
