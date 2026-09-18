import { MOCK_TAXI_DRIVERS } from "./drivers";

const brands = {
  Bike: [["Bajaj", "Pulsar"], ["TVS", "Apache"], ["Hero", "Splendor"]],
  Auto: [["Bajaj", "RE Auto"], ["Piaggio", "Ape City"]],
  Taxi: [["Maruti", "Swift Dzire"], ["Hyundai", "Aura"], ["Tata", "Tigor"]],
  "Cab Premium": [["Honda", "City"], ["Hyundai", "Verna"], ["Toyota", "Camry"]],
  SUV: [["Toyota", "Innova"], ["Maruti", "Ertiga"], ["Mahindra", "Marazzo"]],
};

function makeVehicle(index) {
  const driver = MOCK_TAXI_DRIVERS[index % MOCK_TAXI_DRIVERS.length];
  const options = brands[driver.vehicleType] || brands.Taxi;
  const [brand, model] = options[index % options.length];
  return {
    id: `TXV-${String(300 + index).padStart(3, "0")}`,
    number: driver.vehicleNumber,
    type: driver.vehicleType,
    brand,
    model,
    year: 2018 + (index % 8),
    ownerName: driver.name,
    driverId: driver.id,
    rcNumber: `RC-${String(880000 + index * 53)}`,
    insuranceExpiry: `202${6 + (index % 3)}-${String((index % 12) + 1).padStart(2, "0")}-15`,
    fitnessExpiry: `202${6 + (index % 4)}-${String((index % 12) + 1).padStart(2, "0")}-28`,
    status: index % 8 === 6 ? "inactive" : "active",
    verification: index % 6 === 4 ? "pending" : "verified",
  };
}

export const MOCK_TAXI_VEHICLES = Array.from({ length: 24 }, (_, i) => makeVehicle(i + 1));
