export const MOCK_TAXI_KPIS = {
  totalDrivers: { value: "248", trend: "up", trendValue: "+12", description: "Registered taxi drivers" },
  onlineDrivers: { value: "163", trend: "up", trendValue: "+8%", description: "Currently online" },
  activeRides: { value: "37", trend: "up", trendValue: "+5", description: "Rides in progress now" },
  pendingRequests: { value: "14", trend: "down", trendValue: "-3", description: "Awaiting driver assignment" },
  completedToday: { value: "612", trend: "up", trendValue: "+9%", description: "Rides completed today" },
  cancelledToday: { value: "28", trend: "down", trendValue: "-6%", description: "Cancelled today" },
  revenueToday: { value: "₹86,420", trend: "up", trendValue: "+11%", description: "Gross fares today" },
  avgRating: { value: "4.6", trend: "up", trendValue: "+0.1", description: "Average trip rating" },
};

export const MOCK_TAXI_DAILY_RIDES = [
  { name: "Mon", rides: 480 },
  { name: "Tue", rides: 512 },
  { name: "Wed", rides: 545 },
  { name: "Thu", rides: 498 },
  { name: "Fri", rides: 640 },
  { name: "Sat", rides: 720 },
  { name: "Sun", rides: 612 },
];

export const MOCK_TAXI_REVENUE = [
  { name: "Mon", revenue: 61200 },
  { name: "Tue", revenue: 66800 },
  { name: "Wed", revenue: 71350 },
  { name: "Thu", revenue: 64900 },
  { name: "Fri", revenue: 83100 },
  { name: "Sat", revenue: 94500 },
  { name: "Sun", revenue: 86420 },
];

export const MOCK_TAXI_VEHICLE_SPLIT = [
  { name: "Bike", value: 38 },
  { name: "Auto", value: 27 },
  { name: "Taxi", value: 21 },
  { name: "Premium", value: 9 },
  { name: "SUV", value: 5 },
];

export const MOCK_TAXI_ACTIVITIES = [
  { id: 1, type: "success", title: "Ride TXRD-9042 completed", message: "Aarav Malhotra rated the trip 5 stars.", time: "2 min ago" },
  { id: 2, type: "info", title: "New driver application", message: "Rohit Mehta applied with a Cab Premium vehicle.", time: "14 min ago" },
  { id: 3, type: "warning", title: "Surge active in Airport Corridor", message: "Demand exceeds supply — 1.5x surge applied.", time: "26 min ago" },
  { id: 4, type: "error", title: "Ride TXRD-9027 cancelled", message: "Customer cancelled after 6 minutes of waiting.", time: "41 min ago" },
  { id: 5, type: "success", title: "Driver payout processed", message: "Weekly payouts of ₹4.2L released to 212 drivers.", time: "1 hr ago" },
];
