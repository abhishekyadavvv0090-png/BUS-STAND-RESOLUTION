export default function handler(request, response) {
    const centerLat = 12.9716;
    const centerLon = 77.5946;
    const radius = 0.05;
    
    const stops = ['Majestic', 'Shivajinagar', 'Electronic City', 'Whitefield', 'Jayanagar', 'KR Market', 'Yeshwanthpur'];
    
    const buses = Array.from({ length: 6 }, (_, i) => {
        const angle = (Date.now() / 60000 + i * 60) % 360;
        const rad = angle * Math.PI / 180;
        
        return {
            id: `KA0${i+1}AB${1000 + i*200}`,
            route: `Route ${i+1}`,
            lat: centerLat + radius * Math.sin(rad + i * 1.047),
            lon: centerLon + radius * Math.cos(rad + i * 1.047),
            eta: Math.max(2, 15 - i * 2),
            nextStop: stops[i % stops.length],
            speed: 30 + Math.random() * 20,
            lastUpdate: new Date().toISOString()
        };
    });

    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Content-Type', 'application/json');
    
    response.status(200).json(buses);
}
