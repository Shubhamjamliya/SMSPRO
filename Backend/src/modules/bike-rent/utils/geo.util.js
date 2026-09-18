/** Ray-casting point-in-polygon for lat/lng polygons (Food detect pattern). */

export const isPointInPolygon = (lat, lng, polygon = []) => {

    if (!Array.isArray(polygon) || polygon.length < 3) return false;



    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {

        const yi = Number(polygon[i].lat ?? polygon[i].latitude);

        const xi = Number(polygon[i].lng ?? polygon[i].longitude);

        const yj = Number(polygon[j].lat ?? polygon[j].latitude);

        const xj = Number(polygon[j].lng ?? polygon[j].longitude);



        if (![xi, yi, xj, yj].every(Number.isFinite)) continue;



        const intersect =

            yi > lat !== yj > lat &&

            lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;

        if (intersect) inside = !inside;

    }

    return inside;

};



export const toFiniteNumber = (value) => {

    const n = typeof value === 'number' ? value : parseFloat(String(value));

    return Number.isFinite(n) ? n : null;

};



/** Rough polygon area in deg² — used to prefer the smallest (most specific) zone. */

export const polygonArea = (polygon = []) => {

    if (!Array.isArray(polygon) || polygon.length < 3) return Number.POSITIVE_INFINITY;

    let area = 0;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {

        const yi = Number(polygon[i].lat ?? polygon[i].latitude);

        const xi = Number(polygon[i].lng ?? polygon[i].longitude);

        const yj = Number(polygon[j].lat ?? polygon[j].latitude);

        const xj = Number(polygon[j].lng ?? polygon[j].longitude);

        if (![xi, yi, xj, yj].every(Number.isFinite)) continue;

        area += xi * yj - xj * yi;

    }

    return Math.abs(area / 2);

};


