import { Briefcase, CalendarClock, Inbox, LayoutDashboard, MapPin, Wrench } from "lucide-react";

export const serviceProviderSidebarMenu = [
  {
    title: "Overview",
    items: [{ label: "Dashboard", path: "/service-provider/dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Bookings",
    items: [
      { label: "Incoming Requests", path: "/service-provider/requests", icon: Inbox },
      { label: "My Jobs", path: "/service-provider/jobs", icon: Briefcase },
    ],
  },
  {
    title: "Business",
    items: [
      { label: "My Services", path: "/service-provider/services", icon: Wrench },
      { label: "My Zones", path: "/service-provider/zones", icon: MapPin },
      { label: "My Availability", path: "/service-provider/availability", icon: CalendarClock },
    ],
  },
];
