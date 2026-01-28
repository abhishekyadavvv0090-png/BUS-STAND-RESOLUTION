const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const qr = require('qr-image');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB (Free MongoDB Atlas)
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bangalore-bus-system')
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.log('❌ MongoDB Error:', err));

// Email transporter (optional - can work without it)
let transporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: process.env.EMAIL_PORT || 587,
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
}

// ============ MONGODB SCHEMAS ============

// Ticket Schema (Simplified - No User Required)
const ticketSchema = new mongoose.Schema({
    ticketId: { type: String, unique: true, required: true },
    // Guest user details
    userName: { type: String, required: true },
    userEmail: { type: String, required: true },
    userPhone: { type: String, required: true },
    // Trip details
    fromStop: { type: String, required: true },
    toStop: { type: String, required: true },
    passengers: { type: Number, required: true, default: 1 },
    fare: { type: Number, required: true },
    // Payment details (simplified)
    paymentMethod: { 
        type: String, 
        enum: ['cash', 'upi', 'card', 'wallet'],
        default: 'cash'
    },
    paymentStatus: { 
        type: String, 
        enum: ['pending', 'paid', 'failed'],
        default: 'pending'
    },
    transactionId: String,
    bookingTime: { type: Date, default: Date.now },
    travelDate: { type: Date, default: Date.now },
    qrCodeData: String,
    seatNumbers: [String],
    isActive: { type: Boolean, default: true },
    notes: String
});

// Bus Schema
const busSchema = new mongoose.Schema({
    busId: { type: String, unique: true, required: true },
    route: { type: String, required: true },
    currentLocation: {
        lat: { type: Number, required: true },
        lon: { type: Number, required: true }
    },
    nextStop: String,
    eta: { type: Number, default: 5 },
    capacity: { type: Number, default: 50 },
    currentPassengers: { type: Number, default: 0 },
    availableSeats: { type: Number, default: 50 },
    occupancyRate: { type: Number, default: 0 },
    speed: { type: Number, default: 30 },
    status: { 
        type: String, 
        enum: ['active', 'inactive', 'maintenance'],
        default: 'active'
    },
    lastUpdated: { type: Date, default: Date.now }
});

// Bus Stop Schema
const stopSchema = new mongoose.Schema({
    name: { type: String, unique: true, required: true },
    location: {
        lat: { type: Number, required: true },
        lon: { type: Number, required: true }
    },
    crowdLevel: { 
        type: String, 
        enum: ['Low', 'Medium', 'High'],
        default: 'Medium'
    },
    vendorBlocked: { type: Boolean, default: false },
    amenities: [String],
    busRoutes: [String],
    ticketCounter: { type: Boolean, default: true }
});

// Create Models
const Ticket = mongoose.model('Ticket', ticketSchema);
const Bus = mongoose.model('Bus', busSchema);
const BusStop = mongoose.model('BusStop', stopSchema);

// ============ HELPER FUNCTIONS ============

// Generate unique ticket ID
function generateTicketId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `BBS-${timestamp}-${random}`.toUpperCase();
}

// Generate QR Code
function generateQRCode(ticketId) {
    try {
        const qr_png = qr.imageSync(ticketId, { type: 'png', size: 10 });
        return qr_png.toString('base64');
    } catch (error) {
        console.error('QR generation error:', error);
        return null;
    }
}

// Send Email (only if configured)
async function sendTicketEmail(email, ticketDetails, qrCodeBase64) {
    if (!transporter) {
        console.log('Email not configured - skipping email');
        return false;
    }
    
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: `🎫 Bus Ticket Confirmation - ${ticketDetails.ticketId}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 10px; padding: 20px;">
                    <h2 style="color: #2c3e50; text-align: center;">🚍 Bengaluru Bus System</h2>
                    <h3 style="color: #27ae60;">Ticket Confirmed! 🎉</h3>
                    
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
                        <p><strong>Ticket ID:</strong> ${ticketDetails.ticketId}</p>
                        <p><strong>Name:</strong> ${ticketDetails.userName}</p>
                        <p><strong>Phone:</strong> ${ticketDetails.userPhone}</p>
                        <p><strong>From:</strong> ${ticketDetails.fromStop}</p>
                        <p><strong>To:</strong> ${ticketDetails.toStop}</p>
                        <p><strong>Passengers:</strong> ${ticketDetails.passengers}</p>
                        <p><strong>Fare:</strong> ₹${ticketDetails.fare}</p>
                        <p><strong>Payment:</strong> ${ticketDetails.paymentMethod.toUpperCase()}</p>
                        <p><strong>Booking Time:</strong> ${new Date(ticketDetails.bookingTime).toLocaleString('en-IN')}</p>
                    </div>
                    
                    ${qrCodeBase64 ? `
                    <div style="text-align: center; margin: 20px 0;">
                        <p><strong>Show this QR Code to the conductor:</strong></p>
                        <img src="data:image/png;base64,${qrCodeBase64}" alt="QR Code" style="width: 150px; height: 150px;"/>
                    </div>
                    ` : ''}
                    
                    <div style="margin-top: 20px; padding: 15px; background: #fff3cd; border-radius: 8px;">
                        <p><strong>⚠️ Payment Instructions:</strong></p>
                        <p>Please pay ₹${ticketDetails.fare} to the bus conductor using ${ticketDetails.paymentMethod.toUpperCase()}</p>
                    </div>
                    
                    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
                        <p>Bengaluru Bus Management System</p>
                        <p>For support: support@bangalorebus.com</p>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`✅ Ticket email sent to ${email}`);
        return true;
    } catch (error) {
        console.error('❌ Email sending error:', error);
        return false;
    }
}

// ============ API ENDPOINTS ============

// 1. Health Check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'Bengaluru Bus System API',
        version: '2.0 - Simplified Payment'
    });
});

// 2. Get Live Buses
app.get('/api/live-buses', async (req, res) => {
    try {
        const buses = await Bus.find({ status: 'active' }).limit(15);
        
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            count: buses.length,
            buses: buses.map(bus => ({
                id: bus.busId,
                route: bus.route,
                location: bus.currentLocation,
                nextStop: bus.nextStop,
                eta: bus.eta,
                capacity: bus.capacity,
                currentPassengers: bus.currentPassengers,
                availableSeats: bus.availableSeats,
                occupancyRate: bus.occupancyRate,
                speed: bus.speed,
                status: bus.status
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. Get Bus by ID
app.get('/api/bus/:busId', async (req, res) => {
    try {
        const bus = await Bus.findOne({ busId: req.params.busId });
        if (!bus) {
            return res.status(404).json({ success: false, error: 'Bus not found' });
        }
        res.json({ success: true, bus });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 4. Get All Bus Stops
app.get('/api/stops', async (req, res) => {
    try {
        const stops = await BusStop.find({});
        res.json({
            success: true,
            count: stops.length,
            stops: stops.map(stop => ({
                name: stop.name,
                location: stop.location,
                crowdLevel: stop.crowdLevel,
                amenities: stop.amenities,
                busRoutes: stop.busRoutes,
                ticketCounter: stop.ticketCounter
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 5. Calculate Fare (Simple formula based on distance)
app.post('/api/calculate-fare', async (req, res) => {
    try {
        const { fromStop, toStop, passengers } = req.body;
        
        if (!fromStop || !toStop || !passengers) {
            return res.status(400).json({ 
                success: false, 
                error: 'Please provide fromStop, toStop, and passengers' 
            });
        }
        
        // Simple fare calculation
        const baseFare = 10; // ₹10 base fare
        const perKmRate = 2; // ₹2 per km
        
        // For simplicity, assume different stops have different distances
        const stopDistances = {
            'Majestic Bus Stand-Shivajinagar': 5,
            'Majestic Bus Stand-Whitefield': 20,
            'Majestic Bus Stand-Electronic City': 25,
            'Majestic Bus Stand-Koramangala': 8,
            'Majestic Bus Stand-Jayanagar': 10,
            'Shivajinagar-Whitefield': 18,
            'Shivajinagar-Electronic City': 22,
            'Koramangala-Electronic City': 15
        };
        
        const routeKey = `${fromStop}-${toStop}`;
        const reverseRouteKey = `${toStop}-${fromStop}`;
        const distance = stopDistances[routeKey] || stopDistances[reverseRouteKey] || 10;
        
        const farePerPerson = baseFare + (distance * perKmRate);
        const totalFare = farePerPerson * passengers;
        
        res.json({
            success: true,
            fromStop,
            toStop,
            passengers,
            distance: distance + ' km',
            farePerPerson,
            totalFare
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 6. Book Ticket (SIMPLIFIED - No payment gateway)
app.post('/api/book-ticket', async (req, res) => {
    try {
        const { 
            userName, 
            userEmail, 
            userPhone, 
            fromStop, 
            toStop, 
            passengers,
            paymentMethod,
            travelDate
        } = req.body;
        
        // Validation
        if (!userName || !userPhone || !fromStop || !toStop || !passengers) {
            return res.status(400).json({ 
                success: false, 
                error: 'Please provide all required fields: userName, userPhone, fromStop, toStop, passengers' 
            });
        }
        
        // Calculate fare
        const fareResponse = await fetch('http://localhost:' + PORT + '/api/calculate-fare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fromStop, toStop, passengers })
        });
        const fareData = await fareResponse.json();
        const fare = fareData.totalFare || (20 * passengers);
        
        // Generate ticket ID
        const ticketId = generateTicketId();
        
        // Generate QR Code
        const qrCodeData = generateQRCode(ticketId);
        
        // Create ticket
        const ticket = new Ticket({
            ticketId,
            userName,
            userEmail: userEmail || 'noemail@provided.com',
            userPhone,
            fromStop,
            toStop,
            passengers,
            fare,
            paymentMethod: paymentMethod || 'cash',
            paymentStatus: 'pending',
            travelDate: travelDate ? new Date(travelDate) : new Date(),
            qrCodeData,
            bookingTime: new Date()
        });
        
        await ticket.save();
        
        // Send email if email provided and configured
        if (userEmail && transporter) {
            await sendTicketEmail(userEmail, ticket, qrCodeData);
        }
        
        res.json({
            success: true,
            message: 'Ticket booked successfully!',
            ticket: {
                ticketId: ticket.ticketId,
                userName: ticket.userName,
                userPhone: ticket.userPhone,
                fromStop: ticket.fromStop,
                toStop: ticket.toStop,
                passengers: ticket.passengers,
                fare: ticket.fare,
                paymentMethod: ticket.paymentMethod,
                paymentStatus: ticket.paymentStatus,
                bookingTime: ticket.bookingTime,
                qrCode: qrCodeData
            },
            paymentInstructions: `Please pay ₹${fare} to the bus conductor using ${paymentMethod || 'cash'}`
        });
    } catch (error) {
        console.error('Booking error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 7. Get Ticket by ID
app.get('/api/ticket/:ticketId', async (req, res) => {
    try {
        const ticket = await Ticket.findOne({ ticketId: req.params.ticketId });
        
        if (!ticket) {
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }
        
        res.json({
            success: true,
            ticket: {
                ticketId: ticket.ticketId,
                userName: ticket.userName,
                userPhone: ticket.userPhone,
                userEmail: ticket.userEmail,
                fromStop: ticket.fromStop,
                toStop: ticket.toStop,
                passengers: ticket.passengers,
                fare: ticket.fare,
                paymentMethod: ticket.paymentMethod,
                paymentStatus: ticket.paymentStatus,
                bookingTime: ticket.bookingTime,
                qrCode: ticket.qrCodeData
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 8. Search Tickets by Phone
app.get('/api/tickets/phone/:phone', async (req, res) => {
    try {
        const tickets = await Ticket.find({ userPhone: req.params.phone })
            .sort({ bookingTime: -1 })
            .limit(10);
        
        res.json({
            success: true,
            count: tickets.length,
            tickets: tickets.map(t => ({
                ticketId: t.ticketId,
                userName: t.userName,
                fromStop: t.fromStop,
                toStop: t.toStop,
                passengers: t.passengers,
                fare: t.fare,
                paymentStatus: t.paymentStatus,
                bookingTime: t.bookingTime
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 9. Confirm Payment (Mark as paid)
app.post('/api/confirm-payment/:ticketId', async (req, res) => {
    try {
        const { transactionId } = req.body;
        
        const ticket = await Ticket.findOne({ ticketId: req.params.ticketId });
        
        if (!ticket) {
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }
        
        ticket.paymentStatus = 'paid';
        ticket.transactionId = transactionId || 'CASH-' + Date.now();
        await ticket.save();
        
        res.json({
            success: true,
            message: 'Payment confirmed',
            ticket: {
                ticketId: ticket.ticketId,
                paymentStatus: ticket.paymentStatus,
                transactionId: ticket.transactionId
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 10. Seed Sample Data
app.get('/api/seed-data', async (req, res) => {
    try {
        // Clear existing data
        await Bus.deleteMany({});
        await BusStop.deleteMany({});
        
        // Seed Buses
        const buses = [
            { 
                busId: "KA01AB1234", 
                route: "Vajra 1", 
                currentLocation: { lat: 12.9774, lon: 77.5711 }, 
                nextStop: "Majestic Bus Stand", 
                eta: 5, 
                capacity: 50, 
                currentPassengers: 35,
                availableSeats: 15,
                occupancyRate: 0.7,
                speed: 30
            },
            { 
                busId: "KA01CD5678", 
                route: "Vajra 2", 
                currentLocation: { lat: 12.9816, lon: 77.6046 }, 
                nextStop: "Shivajinagar", 
                eta: 8, 
                capacity: 50, 
                currentPassengers: 20,
                availableSeats: 30,
                occupancyRate: 0.4,
                speed: 28
            },
            { 
                busId: "KA01EF9012", 
                route: "Big 10", 
                currentLocation: { lat: 12.9616, lon: 77.5846 }, 
                nextStop: "Whitefield", 
                eta: 12, 
                capacity: 40, 
                currentPassengers: 38,
                availableSeats: 2,
                occupancyRate: 0.95,
                speed: 35
            },
            { 
                busId: "KA01GH3456", 
                route: "Big 5", 
                currentLocation: { lat: 12.9916, lon: 77.6146 }, 
                nextStop: "Koramangala", 
                eta: 3, 
                capacity: 40, 
                currentPassengers: 10,
                availableSeats: 30,
                occupancyRate: 0.25,
                speed: 25
            }
        ];
        
        await Bus.insertMany(buses);
        
        // Seed Bus Stops
        const stops = [
            {
                name: "Majestic Bus Stand",
                location: { lat: 12.9777, lon: 77.5718 },
                crowdLevel: "High",
                amenities: ["Restrooms", "Food Court", "Waiting Area", "ATM"],
                busRoutes: ["Vajra 1", "Vajra 2", "Big 5", "Big 10"],
                ticketCounter: true
            },
            {
                name: "Shivajinagar",
                location: { lat: 12.9878, lon: 77.6021 },
                crowdLevel: "Medium",
                amenities: ["Restrooms", "Small Shop"],
                busRoutes: ["Vajra 2", "Big 10"],
                ticketCounter: true
            },
            {
                name: "Whitefield",
                location: { lat: 12.9698, lon: 77.7500 },
                crowdLevel: "High",
                amenities: ["Restrooms", "Food Court", "Shopping Mall"],
                busRoutes: ["Big 10"],
                ticketCounter: true
            },
            {
                name: "Electronic City",
                location: { lat: 12.8398, lon: 77.6773 },
                crowdLevel: "Medium",
                amenities: ["Restrooms", "Waiting Area"],
                busRoutes: ["Big 10"],
                ticketCounter: true
            },
            {
                name: "Koramangala",
                location: { lat: 12.9352, lon: 77.6245 },
                crowdLevel: "High",
                amenities: ["Restrooms", "Food Stalls", "ATM"],
                busRoutes: ["Big 5"],
                ticketCounter: true
            },
            {
                name: "Jayanagar",
                location: { lat: 12.9250, lon: 77.5838 },
                crowdLevel: "Low",
                amenities: ["Restrooms", "Small Shop"],
                busRoutes: ["Vajra 1"],
                ticketCounter: true
            }
        ];
        
        await BusStop.insertMany(stops);
        
        res.json({
            success: true,
            message: 'Database seeded successfully',
            busesCount: buses.length,
            stopsCount: stops.length
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 11. Admin Dashboard
app.get('/api/admin/dashboard', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const todaysTickets = await Ticket.countDocuments({
            bookingTime: { $gte: today, $lt: tomorrow }
        });
        
        const todaysRevenue = await Ticket.aggregate([
            { 
                $match: { 
                    bookingTime: { $gte: today, $lt: tomorrow },
                    paymentStatus: 'paid'
                }
            },
            { $group: { _id: null, total: { $sum: '$fare' } } }
        ]);
        
        const recentTickets = await Ticket.find({})
            .sort({ bookingTime: -1 })
            .limit(10)
            .select('ticketId userName fromStop toStop fare paymentStatus bookingTime');
        
        res.json({
            success: true,
            dashboard: {
                todaysTickets,
                todaysRevenue: todaysRevenue[0]?.total || 0,
                totalTickets: await Ticket.countDocuments(),
                activeBuses: await Bus.countDocuments({ status: 'active' }),
                totalBusStops: await BusStop.countDocuments(),
                recentTickets
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Bengaluru Bus Backend running on port ${PORT}`);
    console.log(`📡 API Base: http://localhost:${PORT}`);
    console.log(`🔗 Health Check: http://localhost:${PORT}/api/health`);
    console.log(`🎫 Book Ticket: POST http://localhost:${PORT}/api/book-ticket`);
    console.log(`🌱 Seed Data: http://localhost:${PORT}/api/seed-data`);
    console.log(`📊 Admin Dashboard: http://localhost:${PORT}/api/admin/dashboard`);
    console.log(`💳 Payment: Simplified - Cash/UPI on bus`);
});
