const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

// MongoDB connection
mongoose.connect("mongodb+srv://radhe19patel:radhe19patel@cluster0.q9ewi.mongodb.net/FoodMania", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

// Define the app
const app = express();
app.use(cors({}));

app.use(bodyParser.json());

// Schema for cart items
const cartSchema = new mongoose.Schema({
    name: String,
    price: Number,
    quantity: Number,
    image: String,
    userEmail: { type: String, required: true }, // Add this line
});

const CartItem = mongoose.model('CartItem', cartSchema);

// Schema for booked rooms
const bookingSchema = new mongoose.Schema({
    userEmail: String,
    roomType: String,
    numRooms: Number,
    numPersons: Number,
    startDate: Date,
    endDate: Date,
    totalPrice: Number,
});

const Booking = mongoose.model('Booking', bookingSchema);

// Add item to the cart (POST request)
app.post('/api/cart', async (req, res) => {
    const { name, price, quantity, image, userEmail } = req.body; // Include userEmail

    try {
        // Find the cart item for the specific user
        let cartItem = await CartItem.findOne({ name, userEmail });

        if (cartItem) {
            // Update the quantity if the item already exists in the cart
            cartItem.quantity += quantity;
            await cartItem.save();
        } else {
            // Create a new cart item if it doesn't exist
            cartItem = new CartItem({ name, price, quantity, image, userEmail }); // Include userEmail
            await cartItem.save();
        }
        res.status(201).send(cartItem);
    } catch (error) {
        console.error('Error adding item to cart:', error);
        res.status(500).send('Server error');
    }
});


// Get cart items (GET request) for a specific user
app.get('/api/cart', async (req, res) => {
    const userEmail = req.query.email;
    console.log('Received email:', userEmail); // Log the received email

    try {
        const cartItems = await CartItem.find({ userEmail: userEmail });
        console.log('Cart items found:', cartItems); // Log the retrieved items
        res.json(cartItems);
    } catch (error) {
        console.error('Error fetching cart items:', error);
        res.status(500).send('Server Error');
    }
});

// Update cart item quantity (PATCH request)
app.patch('/api/cart/:id', async (req, res) => {
    const { id } = req.params;
    const { action } = req.body;

    try {
        const cartItem = await CartItem.findById(id);
        if (!cartItem) {
            return res.status(404).send('Item not found');
        }

        if (action === 'add') {
            cartItem.quantity += 1;
        } else if (action === 'remove') {
            cartItem.quantity -= 1;
            if (cartItem.quantity <= 0) {
                // If the quantity drops to 0 or below, remove the item from the cart
                await CartItem.findByIdAndDelete(id);
            }
        }

        if (cartItem.quantity > 0) {
            await cartItem.save();
        }

        // Fetch updated cart items for the user
        const updatedCartItems = await CartItem.find({ userEmail: cartItem.userEmail });
        res.json(updatedCartItems);
    } catch (error) {
        console.error('Error updating cart item quantity:', error);
        res.status(500).send('Server error');
    }
});

// Book a room (POST request)
app.post('/api/bookRooms', async (req, res) => {
    const { roomType, numRooms, numPersons, startDate, endDate, userEmail } = req.body; // Get userEmail from request body

    // Calculate total price based on room type and number of nights
    const roomPrices = { Regular: 100, Standard: 150, Luxurious: 250 };
    const start = new Date(startDate);
    const end = new Date(endDate);
    const numberOfNights = (end - start) / (1000 * 60 * 60 * 24);
    const totalPrice = roomPrices[roomType] * numRooms * numberOfNights;

    // Create new booking
    const newBooking = new Booking({
        userEmail, // Use the userEmail passed in the request
        roomType,
        numRooms,
        numPersons,
        startDate: start,
        endDate: end,
        totalPrice,
    });

    try {
        await newBooking.save();
        res.status(200).json({ message: 'Room booked successfully!', booking: newBooking });
    } catch (error) {
        res.status(500).json({ message: 'Error booking room', error });
    }
});

// Get booked rooms (GET request)
app.get('/api/bookings', async (req, res) => {
    const userEmail = req.query.email; // Ensure you're getting user email correctly
    try {
        const bookings = await Booking.find({ userEmail: userEmail }); // Filter bookings by userEmail
        res.status(200).send(bookings);
    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).send('Server error');
    }
});

const tableBookingSchema = new mongoose.Schema({
    name: { type: String, required: true },       // Name of the person booking the table
    email: { type: String, required: true },      // Email of the person booking the table
    mobile: { type: String, required: true },     // Mobile number of the person booking the table
    numTables: { type: Number, required: true },  // Number of tables booked
    bookingTime: { type: Date, required: true },  // Booking time selected by the user
    createdAt: { type: Date, default: Date.now }, // Date when the booking was created
});

// Schema for available tables
const availableTableSchema = new mongoose.Schema({
    totalTables: { type: Number, default: 30 },  // Set default available tables as 30
    bookedTables: { type: Number, default: 0 },  // Track how many tables are booked
});

const TableBooking = mongoose.model('TableBooking', tableBookingSchema);
const AvailableTable = mongoose.model('AvailableTable', availableTableSchema);

// Initialize default available tables if not set
const initializeAvailableTables = async () => {
    try {
        let availableTables = await AvailableTable.findOne();
        if (!availableTables) {
            availableTables = new AvailableTable({ totalTables: 30 });
            await availableTables.save();
            console.log('Default available tables set to 30.');
        }
    } catch (error) {
        console.error('Error initializing available tables:', error);
    }
};

initializeAvailableTables();  // Ensure the available tables are set on server start

// Book a table (POST request)
app.post('/api/bookTable', async (req, res) => {
    const { numTables, bookingTime, name, email, mobile } = req.body;

    try {
        const now = new Date();
        const bookingDateTime = new Date(bookingTime);

        // Validate booking time (must be more than 2 hours ahead)
        const timeDiff = (bookingDateTime - now) / (1000 * 60 * 60);
        if (timeDiff <= 2) {
            return res.status(400).send('Booking must be made at least 2 hours before the selected time.');
        }

        // Get available tables
        let availableTables = await AvailableTable.findOne();
        if (!availableTables) {
            return res.status(400).send('No tables available for booking.');
        }

        const remainingTables = availableTables.totalTables - availableTables.bookedTables;
        
        // Validate if enough tables are available
        if (numTables > remainingTables) {
            return res.status(400).send('Not enough tables available for booking.');
        }

        // Save the booking and update available tables
        const tableBooking = new TableBooking({ numTables, bookingTime, name, email, mobile });
        await tableBooking.save();

        // Update the booked tables count
        availableTables.bookedTables += numTables;
        await availableTables.save();

        res.status(201).send('Table booked successfully!');
    } catch (error) {
        console.error('Error booking the table:', error);
        res.status(500).send('Server error');
    }
});

// Get available tables (GET request)
app.get('/api/availableTables', async (req, res) => {
    try {
        const availableTables = await AvailableTable.findOne();
        res.status(200).send(availableTables);
    } catch (error) {
        console.error('Error fetching available tables:', error);
        res.status(500).send('Server error');
    }
});

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    pwd: { type: String, required: true }
}, {
    versionKey: false
});

const User = mongoose.model("users", userSchema);

// Sign-up API
app.post("/api/SignIn", async (req, res) => {
    const { name, email, pwd } = req.body;

    let result = await User.findOne({ email });
    if (result) {
        res.send({ status: false, msg: "User already exists" });
    } else {
        let newUser = new User({ name, email, pwd });
        await newUser.save();
        res.send({ status: true, data: newUser, msg: "User registered successfully" });
    }
});

// Login API
app.post("/api/Login", async (req, res) => {
    const { email, pwd } = req.body;

    let result = await User.findOne({ email, pwd });
    if (result) {
        res.send({ status: true, data: result, msg: "User authenticated" });
    } else {
        res.send({ status: false, msg: "Invalid credentials" });
    }
});

// Start the server
const port = process.env.PORT || 5000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});