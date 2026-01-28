const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Razorpay = require('razorpay');
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
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bangalore-bus-system', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.log('❌ MongoDB Error:', err));

// Initialize Razorpay with YOUR ACCOUNT
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_example',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'example_secret'
});

// Email transporter
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// ============ MONGODB SCHEMAS ============

// User Schema
const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    phone: { type: String, unique: true },
    walletBalance: { type: Number, default: 0 },
    totalBookings: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

// Ticket Schema
const ticketSchema = new mongoose.Schema({
    ticketId: { type: String, unique: true, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: String,
    userEmail: String,
    userPhone: String,
    fromStop: { type: String, required: true },
    toStop: { type: String, required: true },
    passengers: { type: Number, required: true },
    fare: { type: Number, required: true },
    razorpayOrderId: String,
    razorpayPaymentId: String,
    paymentStatus: { 
        type: String, 
        enum: ['pending', 'paid', 'failed', 'refunded'],
        default: 'pending'
    },
    bookingTime: { type: Date, default: Date.now },
    travelDate: { type: Date, default: Date.now },
    qrCodeData: String,
    seatNumbers: [String],
    isActive: { type: Boolean, default: true }
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
    availableSeats: { type: Number, default: 50 },
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

// Transaction Schema
const transactionSchema = new mongoose.Schema({
    transactionId: { type: String, unique: true, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    amount: { type: Number, required: true },
    type: { 
        type: String, 
        enum: ['ticket_purchase', 'wallet_topup', 'refund'],
        required: true
    },
    razorpayOrderId: String,
    razorpayPaymentId: String,
    status: { 
        type: String, 
        enum: ['pending', 'completed', 'failed'],
        default: 'pending'
    },
    description: String,
    createdAt: { type: Date, default: Date.now }
});

// Create Models
const User = mongoose.model('User', userSchema);
const Ticket = mongoose.model('Ticket', ticketSchema);
const Bus = mongoose.model('Bus', busSchema);
const BusStop = mongoose.model('BusStop', stopSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);

// ============ HELPER FUNCTIONS ============

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

// Send Email
async function sendTicketEmail(email, ticketDetails, qrCodeBase64) {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: `🎫 Bengaluru Bus Ticket Confirmation - ${ticketDetails.ticketId}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 10px; padding: 20px;">
                    <h2 style="color: #2c3e50; text-align: center;">🚍 Bengaluru Bus System</h2>
                    <h3 style="color: #27ae60;">Ticket Confirmed! 🎉</h3>
                    
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
                        <p><strong>Ticket ID:</strong> ${ticketDetails.ticketId}</p>
                        <p><strong>From:</strong> ${ticketDetails.fromStop}</p>
                        <p><strong>To:</strong> ${ticketDetails.toStop}</p>
                        <p><strong>Passengers:</strong> ${ticketDetails.passengers}</p>
                        <p><strong>Fare:</strong> ₹${ticketDetails.fare}</p>
                        <p><strong>Booking Time:</strong> ${new Date(ticketDetails.bookingTime).toLocaleString('en-IN')}</p>
                        <p><strong>Status:</strong> <span style="color: #27ae60; font-weight: bold;">Confirmed</span></p>
                    </div>
                    
                    ${qrCodeBase64 ? `
                    <div style="text-align: center; margin: 20px 0;">
                        <p><strong>Scan QR Code at bus entry:</strong></p>
                        <img src="data:image/png;base64,${qrCodeBase64}" alt="QR Code" style="width: 150px; height: 150px;"/>
                    </div>
                    ` : ''}
                    
                    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
                        <p><strong>Team:</strong> VIJAY, ESHWAR, AMAN, ABHISHEK, AKSHAY</p>
                        <p>Bengaluru Bus Management System</p>
                        <p>For support: support@bangalorebus.com | Phone: 080-12345678</p>
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
        razorpay: 'Integrated',
        author: 'Abhishek (razorpay.me/@abhishek0090)'
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
                lat: bus.currentLocation.lat,
                lon: bus.currentLocation.lon,
                eta: bus.eta,
                nextStop: bus.nextStop,
                availableSeats: bus.availableSeats,
                capacity: bus.capacity,
                status: bus.status
            }))
        });
    } catch (error) {
        console.error('Error fetching buses:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. Get Bus Stops
app.get('/api/bus-stops', async (req, res) => {
    try {
        const stops = await BusStop.find({});
        res.json({
            success: true,
            count: stops.length,
            stops: stops.map(stop => ({
                id: stop._id,
                name: stop.name,
                lat: stop.location.lat,
                lon: stop.location.lon,
                crowdLevel: stop.crowdLevel,
                vendorBlocked: stop.vendorBlocked,
                amenities: stop.amenities
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 4. Create User (Register)
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, phone } = req.body;
        
        // Check if user exists
        const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User with this email or phone already exists'
            });
        }
        
        const user = new User({
            name,
            email,
            phone,
            walletBalance: 0,
            totalBookings: 0
        });
        
        await user.save();
        
        res.json({
            success: true,
            message: 'User registered successfully',
            userId: user._id,
            user: {
                name: user.name,
                email: user.email,
                phone: user.phone
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 5. Create Razorpay Order (Ticket Payment)
app.post('/api/create-order', async (req, res) => {
    try {
        const { amount, fromStop, toStop, passengers, userId, userName, userEmail, userPhone } = req.body;
        
        // Calculate fare (₹25 per passenger)
        const fare = passengers * 25;
        const totalAmount = fare * 100; // Convert to paise
        
        // Create Razorpay Order
        const options = {
            amount: totalAmount,
            currency: 'INR',
            receipt: `bus_ticket_${Date.now()}`,
            notes: {
                fromStop,
                toStop,
                passengers,
                userId: userId || 'guest',
                userName: userName || 'Guest',
                userEmail: userEmail || '',
                userPhone: userPhone || ''
            },
            payment_capture: 1 // Auto capture payment
        };

        console.log('Creating Razorpay order for:', options.amount, 'paise');
        
        const order = await razorpay.orders.create(options);
        
        // Generate ticket ID
        const ticketId = `TKT${Date.now().toString().substr(-8)}${Math.floor(Math.random() * 1000)}`;
        
        // Save ticket with pending payment
        const ticket = new Ticket({
            ticketId,
            userId: userId || null,
            userName: userName || 'Guest',
            userEmail: userEmail || '',
            userPhone: userPhone || '',
            fromStop,
            toStop,
            passengers,
            fare,
            razorpayOrderId: order.id,
            paymentStatus: 'pending',
            travelDate: new Date()
        });
        
        await ticket.save();
        
        // Create transaction record
        const transaction = new Transaction({
            transactionId: `TXN${Date.now().toString().substr(-8)}`,
            userId: userId || null,
            amount: fare,
            type: 'ticket_purchase',
            razorpayOrderId: order.id,
            status: 'pending',
            description: `Bus ticket from ${fromStop} to ${toStop} for ${passengers} passenger(s)`
        });
        
        await transaction.save();

        res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            ticketId: ticketId,
            key: process.env.RAZORPAY_KEY_ID,
            user: {
                name: userName,
                email: userEmail,
                phone: userPhone
            },
            fareDetails: {
                baseFare: 25,
                passengers: passengers,
                totalFare: fare
            }
        });
        
    } catch (error) {
        console.error('❌ Order creation error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            details: 'Razorpay order creation failed. Check your Razorpay credentials.'
        });
    }
});

// 6. Verify Payment (Webhook & Manual)
app.post('/api/verify-payment', async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, ticketId } = req.body;
        
        // Generate signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        if (expectedSignature === razorpay_signature) {
            // ✅ Payment successful
            
            // Update ticket
            const ticket = await Ticket.findOneAndUpdate(
                { ticketId: ticketId },
                { 
                    paymentStatus: 'paid',
                    razorpayPaymentId: razorpay_payment_id,
                    razorpayOrderId: razorpay_order_id
                },
                { new: true }
            );
            
            // Update transaction
            await Transaction.findOneAndUpdate(
                { razorpayOrderId: razorpay_order_id },
                {
                    razorpayPaymentId: razorpay_payment_id,
                    status: 'completed'
                }
            );
            
            // Update user stats
            if (ticket.userId) {
                await User.findByIdAndUpdate(ticket.userId, {
                    $inc: { totalBookings: 1 }
                });
            }
            
            // Generate QR Code
            const qrCodeBase64 = generateQRCode(ticketId);
            await Ticket.findOneAndUpdate(
                { ticketId: ticketId },
                { qrCodeData: qrCodeBase64 }
            );
            
            // Send email if user email exists
            if (ticket.userEmail) {
                await sendTicketEmail(ticket.userEmail, ticket, qrCodeBase64);
            }

            res.json({
                success: true,
                message: '✅ Payment verified successfully! Ticket booked.',
                ticketId: ticketId,
                paymentId: razorpay_payment_id,
                qrCode: qrCodeBase64,
                downloadLink: `/api/ticket/download/${ticketId}`
            });
            
        } else {
            // ❌ Payment verification failed
            
            await Ticket.findOneAndUpdate(
                { ticketId: ticketId },
                { paymentStatus: 'failed' }
            );
            
            await Transaction.findOneAndUpdate(
                { razorpayOrderId: razorpay_order_id },
                { status: 'failed' }
            );
            
            res.status(400).json({
                success: false,
                message: '❌ Payment verification failed. Signature mismatch.'
            });
        }
    } catch (error) {
        console.error('Payment verification error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// 7. Razorpay Webhook (For automatic payment confirmation)
app.post('/api/razorpay-webhook', async (req, res) => {
    try {
        const webhookSignature = req.headers['x-razorpay-signature'];
        const webhookBody = JSON.stringify(req.body);
        
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(webhookBody)
            .digest('hex');
        
        if (webhookSignature === expectedSignature) {
            const event = req.body.event;
            const payment = req.body.payload.payment.entity;
            
            if (event === 'payment.captured') {
                // Update ticket status automatically
                await Ticket.findOneAndUpdate(
                    { razorpayOrderId: payment.order_id },
                    {
                        paymentStatus: 'paid',
                        razorpayPaymentId: payment.id
                    }
                );
                
                await Transaction.findOneAndUpdate(
                    { razorpayOrderId: payment.order_id },
                    { status: 'completed' }
                );
                
                console.log(`✅ Webhook: Payment ${payment.id} captured successfully`);
            }
        }
        
        res.json({ status: 'OK' });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 8. Get Ticket Details
app.get('/api/ticket/:ticketId', async (req, res) => {
    try {
        const ticket = await Ticket.findOne({ ticketId: req.params.ticketId });
        if (!ticket) {
            return res.status(404).json({ 
                success: false, 
                message: 'Ticket not found' 
            });
        }
        
        res.json({
            success: true,
            ticket: {
                ticketId: ticket.ticketId,
                fromStop: ticket.fromStop,
                toStop: ticket.toStop,
                passengers: ticket.passengers,
                fare: ticket.fare,
                paymentStatus: ticket.paymentStatus,
                bookingTime: ticket.bookingTime,
                travelDate: ticket.travelDate,
                qrCode: ticket.qrCodeData,
                userName: ticket.userName,
                userPhone: ticket.userPhone
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 9. Download Ticket as PDF/Image
app.get('/api/ticket/download/:ticketId', async (req, res) => {
    try {
        const ticket = await Ticket.findOne({ ticketId: req.params.ticketId });
        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }
        
        // Create simple HTML ticket
        const htmlContent = `
            <html>
            <head>
                <title>Ticket ${ticket.ticketId}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    .ticket { border: 2px dashed #3498db; padding: 20px; border-radius: 10px; max-width: 400px; }
                    .header { text-align: center; color: #2c3e50; }
                    .details { margin: 15px 0; }
                    .qr-code { text-align: center; margin: 20px 0; }
                    .footer { font-size: 12px; color: #666; margin-top: 20px; }
                </style>
            </head>
            <body>
                <div class="ticket">
                    <h2 class="header">🚍 Bengaluru Bus System</h2>
                    <h3>Ticket Confirmed! 🎉</h3>
                    <div class="details">
                        <p><strong>Ticket ID:</strong> ${ticket.ticketId}</p>
                        <p><strong>From:</strong> ${ticket.fromStop}</p>
                        <p><strong>To:</strong> ${ticket.toStop}</p>
                        <p><strong>Passengers:</strong> ${ticket.passengers}</p>
                        <p><strong>Fare:</strong> ₹${ticket.fare}</p>
                        <p><strong>Booking Time:</strong> ${new Date(ticket.bookingTime).toLocaleString('en-IN')}</p>
                        <p><strong>Status:</strong> ${ticket.paymentStatus === 'paid' ? '✅ Confirmed' : '⏳ Pending'}</p>
                    </div>
                    ${ticket.qrCodeData ? `
                    <div class="qr-code">
                        <p><strong>Scan QR Code:</strong></p>
                        <img src="data:image/png;base64,${ticket.qrCodeData}" width="150" height="150"/>
                    </div>
                    ` : ''}
                    <div class="footer">
                        <p>Team: VIJAY, ESHWAR, AMAN, ABHISHEK, AKSHAY</p>
                        <p>Bengaluru Bus Management System</p>
                    </div>
                </div>
            </body>
            </html>
        `;
        
        res.setHeader('Content-Type', 'text/html');
        res.send(htmlContent);
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 10. Submit Report
app.post('/api/submit-report', async (req, res) => {
    try {
        const { type, stop, description, userId } = req.body;
        
        if (type === 'crowd') {
            await BusStop.findOneAndUpdate(
                { name: stop },
                { crowdLevel: 'High' }
            );
        }
        
        if (type === 'vendor') {
            await BusStop.findOneAndUpdate(
                { name: stop },
                { vendorBlocked: true }
            );
        }

        res.json({
            success: true,
            message: 'Report submitted successfully',
            reportId: `REP${Date.now().toString().substr(-8)}`
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 11. Get System Stats
app.get('/api/stats', async (req, res) => {
    try {
        const totalTickets = await Ticket.countDocuments();
        const totalRevenue = await Ticket.aggregate([
            { $match: { paymentStatus: 'paid' } },
            { $group: { _id: null, total: { $sum: '$fare' } } }
        ]);
        
        const activeBuses = await Bus.countDocuments({ status: 'active' });
        const totalUsers = await User.countDocuments();
        
        res.json({
            success: true,
            stats: {
                totalTickets,
                totalRevenue: totalRevenue[0]?.total || 0,
                activeBuses,
                totalUsers,
                activeStops: await BusStop.countDocuments()
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 12. Simulate Bus Movement (For admin)
app.post('/api/admin/simulate-buses', async (req, res) => {
    try {
        const buses = await Bus.find({ status: 'active' });
        
        for (const bus of buses) {
            // Simulate realistic movement
            const latChange = (Math.random() - 0.5) * 0.01;
            const lonChange = (Math.random() - 0.5) * 0.01;
            
            const newLat = Math.max(12.80, Math.min(13.10, bus.currentLocation.lat + latChange));
            const newLon = Math.max(77.50, Math.min(77.80, bus.currentLocation.lon + lonChange));
            
            const newETA = Math.max(1, bus.eta - 1);
            if (newETA <= 0) {
                // Move to next stop
                const stops = await BusStop.find({});
                const randomStop = stops[Math.floor(Math.random() * stops.length)];
                bus.nextStop = randomStop.name;
                bus.eta = 5 + Math.floor(Math.random() * 15);
            }
            
            await Bus.findByIdAndUpdate(bus._id, {
                currentLocation: { lat: newLat, lon: newLon },
                eta: newETA,
                lastUpdated: new Date()
            });
        }

        res.json({
            success: true,
            message: 'Bus locations updated',
            updatedCount: buses.length
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 13. Seed Initial Data
app.get('/api/seed-data', async (req, res) => {
    try {
        // Clear existing data
        await Bus.deleteMany({});
        await BusStop.deleteMany({});
        
        // Seed Bus Stops
        const stops = [
            { 
                name: "Majestic Bus Stand", 
                location: { lat: 12.9774, lon: 77.5711 }, 
                crowdLevel: "High",
                amenities: ["Ticket Counter", "Waiting Area", "Food Court", "Restrooms"],
                busRoutes: ["Vajra 1", "Vajra 2", "Big 10", "Big 5", "Airport"]
            },
            { 
                name: "Shivajinagar", 
                location: { lat: 12.9915, lon: 77.6037 }, 
                crowdLevel: "Medium",
                amenities: ["Ticket Counter", "Waiting Area"],
                busRoutes: ["Vajra 1", "Vajra 2", "Vajra 3"]
            },
            { 
                name: "Electronic City", 
                location: { lat: 12.8459, lon: 77.6633 }, 
                crowdLevel: "Low",
                amenities: ["Ticket Counter", "Restrooms"],
                busRoutes: ["Airport", "Big 10", "Vajra 4"]
            },
            { 
                name: "Whitefield", 
                location: { lat: 12.9698, lon: 77.7500 }, 
                crowdLevel: "Medium",
                amenities: ["Ticket Counter", "Food Court", "Restrooms"],
                busRoutes: ["Big 5", "Vajra 2", "City Circular"]
            },
            { 
                name: "Jayanagar", 
                location: { lat: 12.9279, lon: 77.5939 }, 
                crowdLevel: "Low",
                amenities: ["Ticket Counter", "Waiting Area"],
                busRoutes: ["Big 10", "Vajra 1", "Express 1"]
            }
        ];
        
        await BusStop.insertMany(stops);
        
        // Seed Buses
        const buses = [
            { 
                busId: "KA01AB1234", 
                route: "Vajra 1", 
                currentLocation: { lat: 12.9774, lon: 77.5711 }, 
                nextStop: "Majestic Bus Stand", 
                eta: 5, 
                capacity: 50, 
                availableSeats: 15,
                speed: 30,
                status: "active"
            },
            { 
                busId: "KA01CD5678", 
                route: "Vajra 2", 
                currentLocation: { lat: 12.9816, lon: 77.6046 }, 
                nextStop: "Shivajinagar", 
                eta: 8, 
                capacity: 50, 
                availableSeats: 20,
                speed: 28,
                status: "active"
            },
            { 
                busId: "KA01EF9012", 
                route: "Big 10", 
                currentLocation: { lat: 12.9616, lon: 77.5846 }, 
                nextStop: "Jayanagar", 
                eta: 12, 
                capacity: 40, 
                availableSeats: 10,
                speed: 35,
                status: "active"
            },
            { 
                busId: "KA01GH3456", 
                route: "Big 5", 
                currentLocation: { lat: 12.9916, lon: 77.6146 }, 
                nextStop: "Majestic Bus Stand", 
                eta: 3, 
                capacity: 40, 
                availableSeats: 5,
                speed: 25,
                status: "active"
            },
            { 
                busId: "KA01IJ7890", 
                route: "Airport", 
                currentLocation: { lat: 12.9516, lon: 77.5746 }, 
                nextStop: "Electronic City", 
                eta: 15, 
                capacity: 60, 
                availableSeats: 25,
                speed: 32,
                status: "active"
            }
        ];
        
        await Bus.insertMany(buses);
        
        // Create sample user
        const user = new User({
            name: "Abhishek Yadav",
            email: "abhishek@example.com",
            phone: "9876543210",
            walletBalance: 500,
            totalBookings: 3
        });
        await user.save();
        
        // Create sample paid ticket
        const sampleTicket = new Ticket({
            ticketId: "TKTSAMPLE123",
            userId: user._id,
            userName: "Abhishek Yadav",
            userEmail: "abhishek@example.com",
            userPhone: "9876543210",
            fromStop: "Majestic Bus Stand",
            toStop: "Electronic City",
            passengers: 2,
            fare: 50,
            razorpayOrderId: "order_sample_123",
            razorpayPaymentId: "pay_sample_123",
            paymentStatus: "paid",
            qrCodeData: generateQRCode("TKTSAMPLE123")
        });
        await sampleTicket.save();
        
        res.json({
            success: true,
            message: 'Database seeded with initial data',
            stopsCount: stops.length,
            busesCount: buses.length,
            sampleUserId: user._id,
            sampleTicketId: sampleTicket.ticketId,
            note: 'Sample ticket created with QR code'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 14. Admin Dashboard Data
app.get('/api/admin/dashboard', async (req, res) => {
    try {
        // Get today's date range
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
            .select('ticketId fromStop toStop fare paymentStatus bookingTime');
        
        res.json({
            success: true,
            dashboard: {
                todaysTickets,
                todaysRevenue: todaysRevenue[0]?.total || 0,
                totalUsers: await User.countDocuments(),
                activeBuses: await Bus.countDocuments({ status: 'active' }),
                recentTickets
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Serve static files (for ticket downloads)
app.use(express.static('public'));

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Bengaluru Bus Backend running on port ${PORT}`);
    console.log(`📡 API Base: http://localhost:${PORT}`);
    console.log(`🔗 Health Check: http://localhost:${PORT}/api/health`);
    console.log(`💳 Razorpay Integrated: razorpay.me/@abhishek0090`);
    console.log(`📊 Admin Dashboard: http://localhost:${PORT}/api/admin/dashboard`);
    console.log(`🌱 Seed Data: http://localhost:${PORT}/api/seed-data`);
});

// In your bus schema (around line 70)
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
    currentPassengers: { type: Number, default: Math.floor(Math.random() * 30) }, // NEW
    availableSeats: { type: Number, default: 20 },
    occupancyRate: { type: Number, default: 0.6 }, // NEW: 60% full
    lastStop: String, // NEW: To track passenger flow
    speed: { type: Number, default: 30 },
    status: { 
        type: String, 
        enum: ['active', 'inactive', 'maintenance'],
        default: 'active'
    },
    lastUpdated: { type: Date, default: Date.now }
});

// Update the seed data function (around line 450)
app.get('/api/seed-data', async (req, res) => {
    try {
        // Clear existing data
        await Bus.deleteMany({});
        
        // Seed Buses with capacity data
        const buses = [
            { 
                busId: "KA01AB1234", 
                route: "Vajra 1", 
                currentLocation: { lat: 12.9774, lon: 77.5711 }, 
                nextStop: "Majestic Bus Stand", 
                lastStop: "Jayanagar",
                eta: 5, 
                capacity: 50, 
                currentPassengers: 35,
                availableSeats: 15,
                occupancyRate: 0.7,
                speed: 30,
                status: "active"
            },
            { 
                busId: "KA01CD5678", 
                route: "Vajra 2", 
                currentLocation: { lat: 12.9816, lon: 77.6046 }, 
                nextStop: "Shivajinagar", 
                lastStop: "Majestic",
                eta: 8, 
                capacity: 50, 
                currentPassengers: 20,
                availableSeats: 30,
                occupancyRate: 0.4,
                speed: 28,
                status: "active"
            },
            { 
                busId: "KA01EF9012", 
                route: "Big 10", 
                currentLocation: { lat: 12.9616, lon: 77.5846 }, 
                nextStop: "Whitefield", 
                lastStop: "Electronic City",
                eta: 12, 
                capacity: 40, 
                currentPassengers: 38,
                availableSeats: 2,
                occupancyRate: 0.95,
                speed: 35,
                status: "active"
            },
            { 
                busId: "KA01GH3456", 
                route: "Big 5", 
                currentLocation: { lat: 12.9916, lon: 77.6146 }, 
                nextStop: "Majestic Bus Stand", 
                lastStop: "Koramangala",
                eta: 3, 
                capacity: 40, 
                currentPassengers: 10,
                availableSeats: 30,
                occupancyRate: 0.25,
                speed: 25,
                status: "active"
            },
            { 
                busId: "KA01IJ7890", 
                route: "Airport", 
                currentLocation: { lat: 12.9516, lon: 77.5746 }, 
                nextStop: "Electronic City", 
                lastStop: "Airport",
                eta: 15, 
                capacity: 60, 
                currentPassengers: 45,
                availableSeats: 15,
                occupancyRate: 0.75,
                speed: 32,
                status: "active"
            }
        ];
        
        await Bus.insertMany(buses);
        
        res.json({
            success: true,
            message: 'Database seeded with capacity data',
            busesCount: buses.length
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Add capacity simulation endpoint
app.post('/api/simulate-capacity', async (req, res) => {
    try {
        const buses = await Bus.find({ status: 'active' });
        
        for (const bus of buses) {
            // Smart capacity simulation
            let passengerChange = 0;
            
            // Morning rush (8-11 AM): buses fill up
            const hour = new Date().getHours();
            if (hour >= 8 && hour <= 11) {
                passengerChange = Math.floor(Math.random() * 5) + 3; // 3-8 passengers board
            }
            // Evening rush (5-8 PM): buses fill up
            else if (hour >= 17 && hour <= 20) {
                passengerChange = Math.floor(Math.random() * 5) + 3;
            }
            // Off-peak: some get on, some get off
            else {
                passengerChange = Math.floor(Math.random() * 6) - 3; // -3 to +3
            }
            
            // Update passenger count
            let newPassengers = bus.currentPassengers + passengerChange;
            newPassengers = Math.max(0, Math.min(bus.capacity, newPassengers)); // Keep within limits
            
            // Calculate occupancy rate
            const occupancyRate = newPassengers / bus.capacity;
            
            await Bus.findByIdAndUpdate(bus._id, {
                currentPassengers: newPassengers,
                availableSeats: bus.capacity - newPassengers,
                occupancyRate: occupancyRate,
                lastUpdated: new Date()
            });
        }
        
        res.json({
            success: true,
            message: 'Bus capacity simulated',
            updated: buses.length,
            timeOfDay: new Date().getHours() + ':00'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
