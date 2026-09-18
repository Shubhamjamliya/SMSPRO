import { MOCK_TAXI_DRIVERS } from "./drivers";

const customers = ["Aarav Malhotra", "Isha Kapoor", "Rohan Desai", "Priya Nair", "Kabir Bhatia", "Sneha Kulkarni", "Dev Chawla", "Ananya Iyer", "Arjun Saxena", "Meera Pillai", "Yash Trivedi", "Nidhi Agarwal"];
const pickups = ["Vijay Nagar Square", "Rajwada Palace", "C21 Mall", "Indore Airport", "Palasia Square", "Bhawarkua Main Road", "Treasure Island Mall", "MR-10 Junction", "Khajrana Temple", "Rau Circle"];
const drops = ["Indore Railway Station", "Brilliant Convention Centre", "Sayaji Hotel", "Phoenix Citadel", "Chappan Dukan", "Holkar Stadium", "IIM Indore", "Super Corridor", "Nehru Park", "Annapurna Temple"];
const vehicleTypes = ["Bike", "Auto", "Taxi", "Cab Premium", "SUV"];
const payments = ["cash", "upi", "card", "wallet"];

export const RIDE_STATUSES = {
  pending: { label: "Pending", tone: "warning" },
  requested: { label: "Requested", tone: "warning" },
  searching: { label: "Searching", tone: "warning" },
  assigned: { label: "Assigned", tone: "info" },
  accepted: { label: "Accepted", tone: "info" },
  arriving: { label: "Driver Arriving", tone: "info" },
  arrived: { label: "Arrived", tone: "info" },
  in_progress: { label: "In Progress", tone: "primary" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
  cancelled_by_rider: { label: "Cancelled by rider", tone: "danger" },
  cancelled_by_driver: { label: "Cancelled by driver", tone: "danger" },
  cancelled_by_system: { label: "Cancelled by system", tone: "danger" },
  no_show: { label: "No show", tone: "danger" },
};

const STATUS_CYCLE = [
  "pending", "accepted", "in_progress", "completed", "completed", "completed",
  "in_progress", "cancelled", "completed", "pending", "arriving", "completed",
];

function makeRide(index) {
  const status = STATUS_CYCLE[index % STATUS_CYCLE.length];
  const hasDriver = status !== "pending";
  const driver = hasDriver ? MOCK_TAXI_DRIVERS[index % MOCK_TAXI_DRIVERS.length] : null;
  const distanceKm = 2 + (index % 17);
  const vehicleType = vehicleTypes[index % vehicleTypes.length];
  const fare = Math.round(40 + distanceKm * (8 + (index % 12)));
  const day = String((index % 20) + 1).padStart(2, "0");
  const createdAt = `2026-07-${day}T${String(8 + (index % 13)).padStart(2, "0")}:${String((index * 7) % 60).padStart(2, "0")}:00`;

  const timeline = [{ label: "Ride Requested", status: "completed", at: createdAt }];
  if (hasDriver) timeline.push({ label: `Driver Assigned — ${driver.name}`, status: "completed", at: createdAt });
  if (["in_progress", "completed"].includes(status)) timeline.push({ label: "Trip Started", status: "completed", at: createdAt });
  if (status === "completed") timeline.push({ label: "Trip Completed", status: "completed", at: createdAt });
  if (status === "cancelled") timeline.push({ label: "Ride Cancelled", status: "cancelled", at: createdAt });

  return {
    id: `TXRD-${String(9000 + index)}`,
    customer: customers[index % customers.length],
    customerPhone: `+91 99${String(30000000 + index * 199).slice(0, 8)}`,
    pickup: pickups[index % pickups.length],
    drop: drops[(index + 3) % drops.length],
    vehicleType,
    driverId: driver?.id || null,
    driverName: driver?.name || "Unassigned",
    distanceKm,
    durationMin: 8 + distanceKm * 2,
    fare,
    paymentMethod: payments[index % payments.length],
    paymentStatus: status === "completed" ? "paid" : status === "cancelled" ? "refunded" : "pending",
    otp: String(1000 + ((index * 37) % 9000)),
    status,
    rating: status === "completed" ? ((index % 5) + 1) : null,
    cancellationReason: status === "cancelled"
      ? ["Driver took too long", "Customer changed plans", "Wrong pickup location"][index % 3]
      : "",
    createdAt,
    timeline,
  };
}

export const MOCK_RIDES = Array.from({ length: 48 }, (_, i) => makeRide(i + 1));
