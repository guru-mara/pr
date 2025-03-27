const express = require('express');
const mariadb = require('mariadb');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();
const port = 3004;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files with proper config
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
});
    
app.use(express.static(path.join(__dirname, 'public')));
// MariaDB Connection Pool
const pool = mariadb.createPool({
    host: 'localhost',
    user: 'root',
    password: '01470451',
    database: 'venue_management',
    connectionLimit: 5
});

// Create Users Table
const createUsersTable = async (conn) => {
    await conn.query(`CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        active BOOLEAN DEFAULT TRUE
    )`);
};

// Create Bookings Table
const createBookingsTable = async (conn) => {
    await conn.query(`CREATE TABLE IF NOT EXISTS bookings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        venue VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        date DATE NOT NULL,
        time TIME NOT NULL,
        username VARCHAR(255) NOT NULL,
        projectorRequired BOOLEAN DEFAULT false,
        speakerRequired BOOLEAN DEFAULT false,
        FOREIGN KEY (username) REFERENCES users(username)
    )`);
};

// Create venues table if it doesn't exist
const createVenuesTable = async (conn) => {
    await conn.query(`CREATE TABLE IF NOT EXISTS venues (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        capacity VARCHAR(20),
        hasProjector BOOLEAN DEFAULT false,
        hasSpeaker BOOLEAN DEFAULT false,
        status ENUM('available', 'unavailable') NOT NULL DEFAULT 'available'
    )`);
};

// Initialize Database Tables
(async () => {
    let conn;
    try {
        conn = await pool.getConnection();
        await createUsersTable(conn);
        await createBookingsTable(conn);
        await createVenuesTable(conn);
        
        // Update schema if needed
        try {
            await conn.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE");
            await conn.query("ALTER TABLE venues ADD COLUMN IF NOT EXISTS capacity VARCHAR(20)");
            await conn.query("ALTER TABLE venues ADD COLUMN IF NOT EXISTS hasProjector BOOLEAN DEFAULT false");
            await conn.query("ALTER TABLE venues ADD COLUMN IF NOT EXISTS hasSpeaker BOOLEAN DEFAULT false");
            console.log("Database schema updated successfully.");
        } catch (err) {
            console.error('Schema update error:', err);
            // Continue execution as this is just a precaution
        }
        
        console.log("Database tables initialized successfully.");
    } catch (err) {
        console.error('Database setup error:', err);
    } finally {
        if (conn) conn.release();
    }
})();

// Signup Route
app.post('/api/signup', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
    }

    let conn;
    try {
        conn = await pool.getConnection();
        
        const existingUser = await conn.query("SELECT * FROM users WHERE username = ?", [username]);
        if (existingUser.length > 0) {
            return res.status(400).json({ message: "Username already taken." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await conn.query("INSERT INTO users (username, password) VALUES (?, ?)", 
            [username, hashedPassword]);

        res.json({ message: "Signup successful! Please login." });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ message: "Error signing up", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// Login Route
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
    }

    let conn;
    try {
        conn = await pool.getConnection();
        const user = await conn.query("SELECT * FROM users WHERE username = ?", [username]);

        if (user.length === 0) {
            return res.status(401).json({ message: "Invalid username or password." });
        }

        const isPasswordValid = await bcrypt.compare(password, user[0].password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: "Invalid username or password." });
        }

        res.json({ message: "Login successful!", user: { username } });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: "Error logging in", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// Add Booking
app.post('/api/bookings', async (req, res) => {
    console.log('Received booking request:', req.body);
    const { title, venue, date, time, username, projectorRequired, speakerRequired } = req.body;
    
    if (!venue || !date || !time || !username) {
        return res.status(400).json({ message: "Title, venue, date, time, and username are required" });
    }

    try {
        const bookingHour = parseInt(time.split(':')[0]);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const bookingDate = new Date(date);
        bookingDate.setHours(0, 0, 0, 0);

        if (bookingHour < 6 || bookingHour > 20) {
            return res.status(400).json({ message: "Bookings allowed only between 6 AM and 8 PM." });
        }

        if (bookingDate < today) {
            return res.status(400).json({ message: "Bookings can only be made from today onwards." });
        }

        let conn;
        try {
            conn = await pool.getConnection();

            const existing = await conn.query(
                `SELECT * FROM bookings 
                WHERE venue = ? 
                AND date = ? 
                AND HOUR(time) = HOUR(?)`, 
                [venue, date, time]
            );

            if (existing.length > 0) {
                return res.status(400).json({ message: "Venue is already booked at this time. Please choose another slot." });
            }

            // Include projector and speaker requirements in the query
            await conn.query(
                "INSERT INTO bookings (title, venue, date, time, username, projectorRequired, speakerRequired) VALUES (?, ?, ?, ?, ?, ?, ?)", 
                [title, venue, date, time, username, projectorRequired || false, speakerRequired || false]
            );

            res.json({ message: "Booking successful!" });
        } finally {
            if (conn) conn.release();
        }
    } catch (err) {
        console.error('Booking error:', err);
        res.status(500).json({ message: "Error booking venue", error: err.message });
    }
});

// Delete Booking
app.delete('/api/bookings/:id', async (req, res) => {
    const bookingId = req.params.id;
    const username = req.query.username;
    const isAdmin = req.query.isAdmin === 'true';
    
    if (!username) {
        return res.status(400).json({ message: "Username is required" });
    }

    let conn;
    try {
        conn = await pool.getConnection();

        // If admin, allow deletion of any booking
        if (isAdmin) {
            // Just check if the booking exists
            const bookingExists = await conn.query(
                "SELECT * FROM bookings WHERE id = ?", 
                [bookingId]
            );
            
            if (bookingExists.length === 0) {
                return res.status(404).json({ message: "Booking not found." });
            }
            
            await conn.query("DELETE FROM bookings WHERE id = ?", [bookingId]);
            return res.json({ message: "Booking deleted successfully by admin." });
        } else {
            // For regular users, check if they own the booking
            const existing = await conn.query(
                "SELECT * FROM bookings WHERE id = ? AND username = ?", 
                [bookingId, username]
            );
            
            if (existing.length === 0) {
                return res.status(403).json({ message: "Booking not found or you don't have permission to delete it." });
            }

            await conn.query("DELETE FROM bookings WHERE id = ? AND username = ?", [bookingId, username]);
            res.json({ message: "Booking deleted successfully." });
        }
    } catch (err) {
        console.error('Delete booking error:', err);
        res.status(500).json({ message: "Error deleting booking", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// Get Bookings
app.get('/api/bookings', async (req, res) => {
    const username = req.query.username;
    let conn;
    try {
        conn = await pool.getConnection();
        
        let query = `
            SELECT 
                id, 
                venue, 
                title,
                DATE_FORMAT(date, '%Y-%m-%d') AS date, 
                TIME_FORMAT(time, '%H:%i') AS time,
                username
            FROM bookings
        `;
        
        let params = [];
        if (username) {
            query += " WHERE username = ?";
            params.push(username);
        }
        
        const results = await conn.query(query, params);

        // For debugging - log what's coming from the database
        console.log("Database results:", results);

        const formattedBookings = results.map(b => ({
            id: b.id,
            title: b.title,
            venue: b.venue,
            start: `${b.date}T${b.time}`,
            time: b.time,
            username: b.username
        }));

        // For debugging - log what's being sent to frontend
        console.log("Formatted bookings:", formattedBookings);

        res.json(formattedBookings);
    } catch (err) {
        console.error("Error in /bookings endpoint:", err);
        res.status(500).json({ message: "Error fetching bookings", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// Get all users
app.get('/api/users', async (req, res) => {
    // Optional: Add admin validation check here
    let conn;
    try {
        conn = await pool.getConnection();
        const users = await conn.query("SELECT username, id, active FROM users");
        res.json(users);
    } catch (err) {
        console.error('Get users error:', err);
        res.status(500).json({ message: "Error fetching users", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// Delete a user
app.delete('/api/users/:username', async (req, res) => {
    const username = req.params.username;
    
    // Don't allow deletion of admin account
    if (username === "admin@example.com") {
        return res.status(403).json({ message: "Cannot delete admin account" });
    }
    
    let conn;
    try {
        conn = await pool.getConnection();
        
        // First, delete all bookings associated with this user
        await conn.query("DELETE FROM bookings WHERE username = ?", [username]);
        
        // Then delete the user
        const result = await conn.query("DELETE FROM users WHERE username = ?", [username]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "User not found" });
        }
        
        res.json({ message: "User deleted successfully" });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ message: "Error deleting user", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// Toggle user status endpoint
app.put('/api/users/:username/toggle-status', async (req, res) => {
    const username = req.params.username;
    
    let conn;
    try {
        conn = await pool.getConnection();
        
        // Check if user exists
        const user = await conn.query("SELECT * FROM users WHERE username = ?", [username]);
        
        if (user.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }
        
        // Toggle the status (active/inactive)
        const currentStatus = user[0].active === undefined ? true : !!user[0].active;
        const newStatus = !currentStatus;
        
        await conn.query("UPDATE users SET active = ? WHERE username = ?", [newStatus, username]);
        
        res.json({ 
            message: `User ${newStatus ? 'activated' : 'deactivated'} successfully`,
            username,
            active: newStatus
        });
    } catch (err) {
        console.error('Toggle user status error:', err);
        res.status(500).json({ message: "Error toggling user status", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// Add or update a venue
app.post('/api/venues', async (req, res) => {
    const { name, capacity, hasProjector, hasSpeaker } = req.body;
    
    if (!name) {
        return res.status(400).json({ message: "Venue name is required" });
    }
    
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query(
            "INSERT INTO venues (name, capacity, hasProjector, hasSpeaker, status) VALUES (?, ?, ?, ?, ?)", 
            [name, capacity || null, hasProjector || false, hasSpeaker || false, 'available']
        );
        res.json({ message: "Venue added successfully" });
    } catch (err) {
        console.error('Add venue error:', err);
        res.status(500).json({ message: "Error adding venue", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// Get all venues
app.get('/api/venues', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const venues = await conn.query("SELECT * FROM venues");
        res.json(venues);
    } catch (err) {
        console.error('Get venues error:', err);
        res.status(500).json({ message: "Error fetching venues", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// Delete venue endpoint
app.delete('/api/venues/:id', async (req, res) => {
    const venueId = req.params.id;
    
    let conn;
    try {
        conn = await pool.getConnection();
        
        // Check if venue exists
        const venue = await conn.query("SELECT * FROM venues WHERE id = ?", [venueId]);
        
        if (venue.length === 0) {
            return res.status(404).json({ message: "Venue not found" });
        }
        
        // Check if venue is being used in any bookings
        const bookings = await conn.query("SELECT COUNT(*) as count FROM bookings WHERE venue = ?", [venue[0].name]);
        
        if (bookings[0].count > 0) {
            return res.status(400).json({ 
                message: "Cannot delete venue as it has existing bookings. Delete the bookings first." 
            });
        }
        
        // Delete the venue
        await conn.query("DELETE FROM venues WHERE id = ?", [venueId]);
        
        res.json({ message: "Venue deleted successfully" });
    } catch (err) {
        console.error('Delete venue error:', err);
        res.status(500).json({ message: "Error deleting venue", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// Update venue endpoint
app.put('/api/venues/:id', async (req, res) => {
    const venueId = req.params.id;
    const { name, capacity, hasProjector, hasSpeaker } = req.body;
    
    if (!name) {
        return res.status(400).json({ message: "Venue name is required" });
    }
    
    let conn;
    try {
        conn = await pool.getConnection();
        
        // Check if venue exists
        const venue = await conn.query("SELECT * FROM venues WHERE id = ?", [venueId]);
        
        if (venue.length === 0) {
            return res.status(404).json({ message: "Venue not found" });
        }
        
        // Update the venue
        await conn.query(
            "UPDATE venues SET name = ?, capacity = ?, hasProjector = ?, hasSpeaker = ? WHERE id = ?", 
            [name, capacity, hasProjector || false, hasSpeaker || false, venueId]
        );
        
        // If venue name has changed, update all bookings with this venue
        if (name !== venue[0].name) {
            await conn.query("UPDATE bookings SET venue = ? WHERE venue = ?", [name, venue[0].name]);
        }
        
        res.json({ 
            message: "Venue updated successfully",
            venue: {
                id: venueId,
                name,
                capacity,
                hasProjector: hasProjector || false,
                hasSpeaker: hasSpeaker || false
            }
        });
    } catch (err) {
        console.error('Update venue error:', err);
        res.status(500).json({ message: "Error updating venue", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// Start Server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`View application at http://localhost:${port}/`);
});