import axios from 'axios';
async function run() {
    try {
        await axios.post('http://localhost:5000/api/v1/taxi/user/quote', {
            pickup: { lat: 22.7196, lng: 75.8577, address: 'Indore' },
            drop: { lat: 22.7533, lng: 75.8937, address: 'Vijay Nagar' },
            vehicleTypeId: '6a699525ddc9a7d22afce6f7'
        }, { headers: { Authorization: 'Bearer DUMMY' } });
    } catch (err) {
        console.log("msg:", err.response?.data?.message);
        console.log("status:", err.response?.status);
    }
}
run();
