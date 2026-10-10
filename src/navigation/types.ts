export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
};

export type MainStackParamList = {
  Tabs: undefined;
  Attendance: undefined;
  Trip: undefined;
  Issues: undefined;
  VehicleCheck: undefined;
  LiveMap: { tripId: string };
  RoutePreview: undefined;
  Notifications: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Inbox: undefined;
  Leave: undefined;
  Tasks: undefined;
  Me: undefined;
};
