/**
 * Smoke checks for Service Provider zone-specific service validation logic.
 * Run: node Backend/src/modules/service-provider/scripts/zoneFlow.smoke.js
 * (Does not require DB — exercises pure validator + geo helpers.)
 */
import { isPointInPolygon, polygonArea } from '../../bike-rent/utils/geo.util.js';
import {
  validateCreateServiceDto,
  validateProviderServicesDto,
} from '../validators/catalog.validator.js';

let passed = 0;
let failed = 0;

const assert = (cond, msg) => {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${msg}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${msg}`);
  }
};

console.log('Validator: create service requires zoneIds');
try {
  validateCreateServiceDto({
    categoryId: '507f1f77bcf86cd799439011',
    name: 'AC Repair',
    basePrice: 499,
  });
  assert(false, 'should reject missing zoneIds');
} catch (e) {
  assert(String(e.message).toLowerCase().includes('zone'), `rejects missing zones: ${e.message}`);
}

try {
  const data = validateCreateServiceDto({
    categoryId: '507f1f77bcf86cd799439011',
    name: 'AC Repair',
    basePrice: 499,
    zoneIds: ['507f1f77bcf86cd799439012'],
  });
  assert(data.zoneIds.length === 1 && data.basePrice === 499, 'accepts valid service + zone');
} catch (e) {
  assert(false, `unexpected: ${e.message}`);
}

console.log('Validator: provider services require price + zoneIds');
try {
  validateProviderServicesDto({
    services: [{ serviceId: '507f1f77bcf86cd799439011', price: 100 }],
  });
  assert(false, 'should reject missing zoneIds on provider service');
} catch (e) {
  assert(String(e.message).toLowerCase().includes('zone'), `rejects missing provider zones: ${e.message}`);
}

try {
  validateProviderServicesDto({
    services: [{
      serviceId: '507f1f77bcf86cd799439011',
      price: 0,
      zoneIds: ['507f1f77bcf86cd799439012'],
    }],
  });
  assert(false, 'should reject zero provider price');
} catch (e) {
  assert(String(e.message).toLowerCase().includes('price') || String(e.message).includes('₹'), `rejects zero price: ${e.message}`);
}

try {
  const data = validateProviderServicesDto({
    services: [{
      serviceId: '507f1f77bcf86cd799439011',
      price: 200,
      zoneIds: ['507f1f77bcf86cd799439012', '507f1f77bcf86cd799439013'],
    }],
  });
  assert(data.services[0].zoneIds.length === 2, 'accepts provider service with zones');
} catch (e) {
  assert(false, `unexpected: ${e.message}`);
}

console.log('Geo: point-in-polygon for customer zone detection');
const square = [
  { lat: 22.7, lng: 75.8 },
  { lat: 22.7, lng: 75.9 },
  { lat: 22.8, lng: 75.9 },
  { lat: 22.8, lng: 75.8 },
];
assert(isPointInPolygon(22.75, 75.85, square) === true, 'point inside zone');
assert(isPointInPolygon(22.5, 75.5, square) === false, 'point outside zone');
assert(polygonArea(square) > 0, 'polygon area positive');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
