const express = require('express');
const mariadb = require('mariadb');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const fetch = require('node-fetch');



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
        role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
        status ENUM('active', 'inactive') NOT NULL DEFAULT 'active'
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
        department VARCHAR(255),
        projectorRequired BOOLEAN DEFAULT false,
        speakerRequired BOOLEAN DEFAULT false,
        FOREIGN KEY (username) REFERENCES users(username)
    )`);
};

// Create Venues Table
const createVenuesTable = async (conn) => {
    await conn.query(`CREATE TABLE IF NOT EXISTS venues (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        capacity VARCHAR(50),
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

        if (user[0].status === 'inactive') {
            return res.status(401).json({ message: "Your account is inactive. Please contact an administrator." });
        }

        const isPasswordValid = await bcrypt.compare(password, user[0].password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: "Invalid username or password." });
        }

        res.json({ 
            message: "Login successful!", 
            user: { 
                username,
                isAdmin: user[0].role === 'admin'
            } 
        });
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
    const { title, venue, date, time, username, department, projectorRequired, speakerRequired } = req.body;
    
    if (!venue || !date || !time || !username) {
        return res.status(400).json({ message: "Venue, date, time, and username are required" });
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
            
            // Verify if venue exists and is available
            const venueData = await conn.query("SELECT * FROM venues WHERE name = ?", [venue]);
            if (venueData.length === 0) {
                return res.status(400).json({ message: "Venue not found." });
            }
            
            if (venueData[0].status === 'unavailable') {
                return res.status(400).json({ message: "This venue is currently unavailable for booking." });
            }

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

            // Include department, projector and speaker requirements in the query
            await conn.query(
                "INSERT INTO bookings (title, venue, date, time, username, department, projectorRequired, speakerRequired) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", 
                [title || "Untitled Booking", venue, date, time, username, department || null, projectorRequired || false, speakerRequired || false]
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
    
    if (!username) {
        return res.status(400).json({ message: "Username is required" });
    }

    let conn;
    try {
        conn = await pool.getConnection();

        // Check if user is admin
        const userResult = await conn.query("SELECT role FROM users WHERE username = ?", [username]);
        const isAdmin = userResult.length > 0 && userResult[0].role === 'admin';
        
        // If admin, allow deletion of any booking, otherwise check ownership
        let query = "SELECT * FROM bookings WHERE id = ?";
        let params = [bookingId];
        
        if (!isAdmin) {
            query += " AND username = ?";
            params.push(username);
        }
        
        const existing = await conn.query(query, params);
        
        if (existing.length === 0) {
            return res.status(403).json({ message: "Booking not found or you don't have permission to delete it." });
        }

        await conn.query("DELETE FROM bookings WHERE id = ?", [bookingId]);
        res.json({ message: "Booking deleted successfully." });
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
    const date = req.query.date;
    
    let conn;
    try {
        conn = await pool.getConnection();
        
        let query = `
            SELECT 
                id, 
                venue, 
                title,
                department,
                DATE_FORMAT(date, '%Y-%m-%d') AS date, 
                TIME_FORMAT(time, '%H:%i') AS time,
                username,
                projectorRequired,
                speakerRequired
            FROM bookings
        `;
        
        let params = [];
        const conditions = [];
        
        if (username) {
            conditions.push("username = ?");
            params.push(username);
        }
        
        if (date) {
            conditions.push("date = ?");
            params.push(date);
        }
        
        if (conditions.length > 0) {
            query += " WHERE " + conditions.join(" AND ");
        }
        
        query += " ORDER BY date, time";
        
        const results = await conn.query(query, params);

        // For debugging - log what's coming from the database
        console.log("Database results:", results);

        const formattedBookings = results.map(b => ({
            id: b.id,
            title: b.title,
            venue: b.venue,
            department: b.department,
            start: `${b.date}T${b.time}`,
            date: b.date,
            time: b.time,
            username: b.username,
            projectorRequired: b.projectorRequired,
            speakerRequired: b.speakerRequired
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
    let conn;
    try {
        conn = await pool.getConnection();
        const users = await conn.query(
            "SELECT id, username, role, status FROM users"
        );
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

// Toggle user status (active/inactive)
app.put('/api/users/:username/toggle-status', async (req, res) => {
    const username = req.params.username;
    
    // Don't allow changing status of admin account
    if (username === "admin@example.com") {
        return res.status(403).json({ message: "Cannot modify admin account status" });
    }
    
    let conn;
    try {
        conn = await pool.getConnection();
        
        // First, get current status
        const user = await conn.query("SELECT status FROM users WHERE username = ?", [username]);
        
        if (user.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }
        
        // Toggle the status
        const newStatus = user[0].status === 'active' ? 'inactive' : 'active';
        
        await conn.query("UPDATE users SET status = ? WHERE username = ?", [newStatus, username]);
        
        res.json({ message: "User status updated successfully", status: newStatus });
    } catch (err) {
        console.error('Toggle user status error:', err);
        res.status(500).json({ message: "Error updating user status", error: err.message });
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
            "INSERT INTO venues (name, capacity, hasProjector, hasSpeaker) VALUES (?, ?, ?, ?)", 
            [name, capacity || '0-50', hasProjector || false, hasSpeaker || false]
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

// Delete venue
app.delete('/api/venues/:id', async (req, res) => {
    const venueId = req.params.id;
    
    let conn;
    try {
        conn = await pool.getConnection();
        
        // Get venue name first for bookings deletion
        const venue = await conn.query("SELECT name FROM venues WHERE id = ?", [venueId]);
        
        if (venue.length === 0) {
            return res.status(404).json({ message: "Venue not found" });
        }
        
        const venueName = venue[0].name;
        
        // First, delete all bookings associated with this venue
        await conn.query("DELETE FROM bookings WHERE venue = ?", [venueName]);
        
        // Then delete the venue
        await conn.query("DELETE FROM venues WHERE id = ?", [venueId]);
        
        res.json({ message: "Venue deleted successfully" });
    } catch (err) {
        console.error('Delete venue error:', err);
        res.status(500).json({ message: "Error deleting venue", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// Toggle venue availability (available/unavailable)
app.put('/api/venues/:id/toggle-status', async (req, res) => {
    const venueId = req.params.id;
    
    let conn;
    try {
        conn = await pool.getConnection();
        
        // First, get current status
        const venue = await conn.query("SELECT status FROM venues WHERE id = ?", [venueId]);
        
        if (venue.length === 0) {
            return res.status(404).json({ message: "Venue not found" });
        }
        
        // Toggle the status
        const newStatus = venue[0].status === 'available' ? 'unavailable' : 'available';
        
        await conn.query("UPDATE venues SET status = ? WHERE id = ?", [newStatus, venueId]);
        
        res.json({ message: "Venue status updated successfully", status: newStatus });
    } catch (err) {
        console.error('Toggle venue status error:', err);
        res.status(500).json({ message: "Error updating venue status", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// Get venue utilization stats
app.get('/api/analytics/utilization', async (req, res) => {
    const daysBack = req.query.days || 30; // Default to 30 days
    
    let conn;
    try {
        conn = await pool.getConnection();
        
        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(daysBack));
        
        // Format dates for SQL
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        
        // Get all venues
        const venues = await conn.query("SELECT * FROM venues");
        
        // Get booking counts per venue in date range
        const bookingCounts = await conn.query(
            `SELECT venue, COUNT(*) as count 
            FROM bookings 
            WHERE date BETWEEN ? AND ? 
            GROUP BY venue`,
            [startDateStr, endDateStr]
        );
        
        // Calculate utilization for each venue
        const utilizationData = venues.map(venue => {
            const bookingData = bookingCounts.find(b => b.venue === venue.name);
            const bookings = bookingData ? bookingData.count : 0;
            
            // Maximum possible bookings (assuming 10 slots per day)
            const maxBookings = parseInt(daysBack) * 10;
            
            // Calculate utilization percentage
            const utilization = Math.min(100, Math.round((bookings / maxBookings) * 100));
            
            return {
                id: venue.id,
                name: venue.name,
                capacity: venue.capacity,
                bookings,
                utilization
            };
        });
        
        // Calculate overall utilization
        const overallUtilization = utilizationData.length > 0
            ? Math.round(utilizationData.reduce((sum, v) => sum + v.utilization, 0) / utilizationData.length)
            : 0;
        
        res.json({
            startDate: startDateStr, 
            endDate: endDateStr,
            overallUtilization,
            venues: utilizationData
        });
    } catch (err) {
        console.error('Utilization analytics error:', err);
        res.status(500).json({ message: "Error fetching utilization data", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// Get department booking stats
app.get('/api/analytics/departments', async (req, res) => {
    const daysBack = req.query.days || 30; // Default to 30 days
    
    let conn;
    try {
        conn = await pool.getConnection();
        
        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(daysBack));
        
        // Format dates for SQL
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        
        // Get booking counts per department in date range
        const departmentStats = await conn.query(
            `SELECT department, COUNT(*) as bookings
            FROM bookings 
            WHERE date BETWEEN ? AND ? 
            GROUP BY department
            ORDER BY bookings DESC`,
            [startDateStr, endDateStr]
        );
        
        res.json({
            startDate: startDateStr,
            endDate: endDateStr,
            departments: departmentStats
        });
    } catch (err) {
        console.error('Department analytics error:', err);
        res.status(500).json({ message: "Error fetching department data", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// Get time-based booking stats (hours and days)
app.get('/api/analytics/time', async (req, res) => {
    const daysBack = req.query.days || 30; // Default to 30 days
    
    let conn;
    try {
        conn = await pool.getConnection();
        
        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(daysBack));
        
        // Format dates for SQL
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        
        // Get bookings in date range
        const bookings = await conn.query(
            `SELECT date, time
            FROM bookings 
            WHERE date BETWEEN ? AND ?`,
            [startDateStr, endDateStr]
        );
        
        // Process time-based stats
        const hourStats = Array(24).fill(0);
        const dayStats = Array(7).fill(0);
        
        bookings.forEach(booking => {
            // Process hour stats
            if (booking.time) {
                const hour = parseInt(booking.time.split(':')[0]);
                if (!isNaN(hour) && hour >= 0 && hour < 24) {
                    hourStats[hour]++;
                }
            }
            
            // Process day of week stats
            if (booking.date) {
                const date = new Date(booking.date);
                const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
                dayStats[dayOfWeek]++;
            }
        });
        
        res.json({
            startDate: startDateStr,
            endDate: endDateStr,
            hourStats,
            dayStats
        });
    } catch (err) {
        console.error('Time analytics error:', err);
        res.status(500).json({ message: "Error fetching time-based analytics", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// Get room efficiency data
app.get('/api/analytics/efficiency', async (req, res) => {
    const daysBack = req.query.days || 30; // Default to 30 days
    
    let conn;
    try {
        conn = await pool.getConnection();
        
        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(daysBack));
        
        // Format dates for SQL
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        
        // Get all venues
        const venues = await conn.query("SELECT * FROM venues");
        
        // For each venue, calculate booking stats
        const efficiencyData = [];
        
        for (const venue of venues) {
            // Get bookings for this venue
            const bookings = await conn.query(
                `SELECT * FROM bookings 
                WHERE venue = ? AND date BETWEEN ? AND ?`,
                [venue.name, startDateStr, endDateStr]
            );
            
            // Calculate usage hours (assuming 2 hours per booking)
            const usageHours = bookings.length * 2;
            
            // Maximum possible hours (assuming 14 hours per day - 6 AM to 8 PM)
            const maxHours = parseInt(daysBack) * 14;
            
            // Calculate utilization percentage
            const utilization = Math.min(100, Math.round((usageHours / maxHours) * 100));
            
            // Extract capacity ranges for efficiency calculation
            let capacityValue = 0;
            if (venue.capacity === '0-50') capacityValue = 25;
            else if (venue.capacity === '50-100') capacityValue = 75;
            else if (venue.capacity === '100-150') capacityValue = 125;
            else if (venue.capacity === '150-200') capacityValue = 175;
            else if (venue.capacity === '200+') capacityValue = 250;
            
            // In a real app, this would use actual attendee counts from bookings
            // For demo purposes, generate a random average within capacity range
            const avgAttendees = Math.min(
                capacityValue,
                Math.floor(Math.random() * (capacityValue * 0.8)) + (capacityValue * 0.2)
            );
            
            // Calculate efficiency score
            // Formula: 70% utilization + 30% space utilization (avgAttendees/capacity)
            const spaceUtilization = capacityValue > 0 ? Math.min(100, Math.round((avgAttendees / capacityValue) * 100)) : 0;
            const efficiencyScore = Math.round((utilization * 0.7) + (spaceUtilization * 0.3));
            
            efficiencyData.push({
                id: venue.id,
                name: venue.name,
                capacity: venue.capacity,
                averageAttendees: avgAttendees,
                usageHours,
                utilization,
                spaceUtilization,
                efficiencyScore
            });
        }
        
        // Sort by efficiency score (highest first)
        efficiencyData.sort((a, b) => b.efficiencyScore - a.efficiencyScore);
        
        res.json({
            startDate: startDateStr,
            endDate: endDateStr,
            venues: efficiencyData
        });
    } catch (err) {
        console.error('Efficiency analytics error:', err);
        res.status(500).json({ message: "Error fetching efficiency data", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// Get comprehensive analytics dashboard data
app.get('/api/analytics/dashboard', async (req, res) => {
    const daysBack = req.query.days || 30; // Default to 30 days
    
    try {
        // Fetch all analytics endpoints in parallel
        const [utilizationData, departmentData, timeData, efficiencyData] = await Promise.all([
            fetch(`http://localhost:${port}/api/analytics/utilization?days=${daysBack}`).then(r => r.json()),
            fetch(`http://localhost:${port}/api/analytics/departments?days=${daysBack}`).then(r => r.json()),
            fetch(`http://localhost:${port}/api/analytics/time?days=${daysBack}`).then(r => r.json()),
            fetch(`http://localhost:${port}/api/analytics/efficiency?days=${daysBack}`).then(r => r.json())
        ]);
        
        // Find most popular venue
        const popularVenue = utilizationData.venues.length > 0 
            ? utilizationData.venues.reduce((max, venue) => venue.bookings > max.bookings ? venue : max, utilizationData.venues[0])
            : null;
            
        // Find busiest department
        const busiestDepartment = departmentData.departments.length > 0 
            ? departmentData.departments[0] 
            : null;
        
        // Compile dashboard data
        const dashboardData = {
            period: {
                startDate: utilizationData.startDate,
                endDate: utilizationData.endDate,
                days: parseInt(daysBack)
            },
            totalBookings: utilizationData.venues.reduce((sum, venue) => sum + venue.bookings, 0),
            overallUtilization: utilizationData.overallUtilization,
            popularVenue: popularVenue ? {
                name: popularVenue.name,
                bookings: popularVenue.bookings,
                utilization: popularVenue.utilization
            } : null,
            busiestDepartment: busiestDepartment ? {
                name: busiestDepartment.department,
                bookings: busiestDepartment.bookings
            } : null,
            venueStats: utilizationData.venues,
            departmentStats: departmentData.departments,
            timeStats: {
                hourly: timeData.hourStats,
                daily: timeData.dayStats
            },
            efficiencyStats: efficiencyData.venues
        };
        
        res.json(dashboardData);
    } catch (err) {
        console.error('Dashboard analytics error:', err);
        res.status(500).json({ message: "Error fetching dashboard data", error: err.message });
    }
});
// Add these routes to your server.js file

// Analytics Endpoints
app.get('/api/analytics', async (req, res) => {
    const { startDate, endDate, venue } = req.query;
    
    let conn;
    try {
        conn = await pool.getConnection();
        
        // Base query conditions
        let conditions = 'WHERE 1=1';
        let params = [];
        
        if (startDate && endDate) {
            conditions += ' AND date BETWEEN ? AND ?';
            params.push(startDate, endDate);
        }
        
        if (venue && venue !== 'all') {
            conditions += ' AND venue = ?';
            params.push(venue);
        }
        
        // Get total bookings
        const totalBookingsQuery = `SELECT COUNT(*) as count FROM bookings ${conditions}`;
        const totalBookingsResult = await conn.query(totalBookingsQuery, params);
        const totalBookings = totalBookingsResult[0].count;
        
        // Get previous period bookings (for comparison)
        // Calculate the date range length
        const start = new Date(startDate);
        const end = new Date(endDate);
        const daysDiff = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
        
        // Calculate the previous period date range
        const prevEnd = new Date(start);
        prevEnd.setDate(prevEnd.getDate() - 1);
        
        const prevStart = new Date(prevEnd);
        prevStart.setDate(prevStart.getDate() - daysDiff + 1);
        
        // Query for previous period
        const prevConditions = 'WHERE date BETWEEN ? AND ?';
        const prevParams = [prevStart.toISOString().split('T')[0], prevEnd.toISOString().split('T')[0]];
        
        if (venue && venue !== 'all') {
            prevParams.push(venue);
            prevConditions += ' AND venue = ?';
        }
        
        const prevBookingsQuery = `SELECT COUNT(*) as count FROM bookings ${prevConditions}`;
        const prevBookingsResult = await conn.query(prevBookingsQuery, prevParams);
        const prevTotalBookings = prevBookingsResult[0].count;
        
        // Calculate booking trend percentage
        let bookingsTrend = 0;
        if (prevTotalBookings > 0) {
            bookingsTrend = ((totalBookings - prevTotalBookings) / prevTotalBookings * 100).toFixed(1);
        }
        
        // Get venue utilization
        const venueUtilizationQuery = `
            SELECT 
                venue,
                COUNT(*) as bookings,
                (COUNT(*) / 
                    (SELECT 
                        DATEDIFF(?, ?) * 
                        (SELECT COUNT(*) FROM venues WHERE status = 'available' 
                         ${venue && venue !== 'all' ? 'AND name = ?' : ''})
                    )
                ) * 100 as utilization_rate
            FROM bookings
            ${conditions}
            GROUP BY venue
            ORDER BY utilization_rate DESC
        `;
        
        const venueUtilizationParams = [
            endDate, 
            startDate, 
            ...(venue && venue !== 'all' ? [venue] : []),
            ...params
        ];
        
        const venueUtilizationResult = await conn.query(venueUtilizationQuery, venueUtilizationParams);
        
        // Calculate overall utilization rate
        const totalAvailableSlots = daysDiff * (await conn.query(
            `SELECT COUNT(*) as count FROM venues WHERE status = 'available'
            ${venue && venue !== 'all' ? 'AND name = ?' : ''}`,
            venue && venue !== 'all' ? [venue] : []
        ))[0].count;
        
        const utilizationRate = totalAvailableSlots > 0 
            ? ((totalBookings / totalAvailableSlots) * 100).toFixed(1) 
            : 0;
        
        // Get previous period utilization rate
        const prevUtilizationRate = prevTotalBookings > 0 && totalAvailableSlots > 0
            ? ((prevTotalBookings / totalAvailableSlots) * 100).toFixed(1)
            : 0;
        
        // Calculate utilization trend
        let utilizationTrend = 0;
        if (prevUtilizationRate > 0) {
            utilizationTrend = (utilizationRate - prevUtilizationRate).toFixed(1);
        }
        
        // Get most used venue
        const mostUsedVenueQuery = `
            SELECT venue, COUNT(*) as count
            FROM bookings
            ${conditions}
            GROUP BY venue
            ORDER BY count DESC
            LIMIT 1
        `;
        
        const mostUsedVenueResult = await conn.query(mostUsedVenueQuery, params);
        const mostUsedVenue = mostUsedVenueResult.length > 0 
            ? mostUsedVenueResult[0].venue 
            : 'N/A';
        
        const mostUsedVenueBookings = mostUsedVenueResult.length > 0 
            ? mostUsedVenueResult[0].count 
            : 0;
        
        // Get peak booking time
        const peakTimeQuery = `
            SELECT 
                HOUR(time) as hour,
                COUNT(*) as count,
                CONCAT(
                    HOUR(time) % 12 = 0 ? 12 : HOUR(time) % 12,
                    ':00 ',
                    HOUR(time) < 12 ? 'AM' : 'PM'
                ) as formatted_time
            FROM bookings
            ${conditions}
            GROUP BY HOUR(time)
            ORDER BY count DESC
            LIMIT 1
        `;
        
        const peakTimeResult = await conn.query(peakTimeQuery, params);
        const peakBookingTime = peakTimeResult.length > 0 
            ? peakTimeResult[0].formatted_time 
            : 'N/A';
        
        const peakTimeCount = peakTimeResult.length > 0 
            ? peakTimeResult[0].count 
            : 0;
        
        const peakTimePercentage = totalBookings > 0 
            ? ((peakTimeCount / totalBookings) * 100).toFixed(1) 
            : 0;
        
        // Get bookings by department
        const departmentBookingsQuery = `
            SELECT 
                department,
                COUNT(*) as count
            FROM bookings
            ${conditions}
            GROUP BY department
            ORDER BY count DESC
        `;
        
        const departmentBookingsResult = await conn.query(departmentBookingsQuery, params);
        
        // Get bookings trend (by week or day depending on range)
        const isLongPeriod = daysDiff > 14;
        const groupBy = isLongPeriod ? 'WEEK' : 'DAY';
        const labelFormat = isLongPeriod ? 'Week %U' : '%Y-%m-%d';
        
        const bookingsTrendQuery = `
            SELECT 
                DATE_FORMAT(date, '${labelFormat}') as label,
                COUNT(*) as count
            FROM bookings
            ${conditions}
            GROUP BY ${groupBy}(date)
            ORDER BY date
        `;
        
        const bookingsTrendResult = await conn.query(bookingsTrendQuery, params);
        
        // Get equipment usage
        const equipmentUsageQuery = `
            SELECT 
                'Projector' as equipment,
                SUM(projectorRequired) as count
            FROM bookings
            ${conditions}
            UNION
            SELECT 
                'Speaker System' as equipment,
                SUM(speakerRequired) as count
            FROM bookings
            ${conditions}
        `;
        
        const equipmentUsageResult = await conn.query(equipmentUsageQuery, [...params, ...params]);
        
        // Get hourly distribution
        const timeDistributionQuery = `
            SELECT 
                HOUR(time) as hour,
                COUNT(*) as count,
                CONCAT(
                    HOUR(time) % 12 = 0 ? 12 : HOUR(time) % 12,
                    ':00 ',
                    HOUR(time) < 12 ? 'AM' : 'PM'
                ) as formatted_hour
            FROM bookings
            ${conditions}
            GROUP BY HOUR(time)
            ORDER BY hour
        `;
        
        const timeDistributionResult = await conn.query(timeDistributionQuery, params);
        
        // Get capacity analysis
        // Note: This would require actual attendee data which is not in your current schema
        // For demo purposes, we'll compute simulated efficiency based on room capacity vs. booking frequency
        const capacityAnalysisQuery = `
            SELECT 
                b.venue,
                COUNT(*) as booking_count,
                CASE
                    WHEN v.name LIKE '%L%' THEN '0-50'
                    WHEN v.name LIKE '%BSR%' THEN '50-100'
                    WHEN v.name LIKE '%S2%' THEN '100-150'
                    WHEN v.name LIKE '%Pavilion%' THEN '200+'
                    ELSE '0-50'
                END as capacity_range,
                CASE
                    WHEN v.name LIKE '%L%' THEN FLOOR(RAND() * 30) + 10
                    WHEN v.name LIKE '%BSR%' THEN FLOOR(RAND() * 30) + 60
                    WHEN v.name LIKE '%S2%' THEN FLOOR(RAND() * 30) + 110
                    WHEN v.name LIKE '%Pavilion%' THEN FLOOR(RAND() * 50) + 180
                    ELSE FLOOR(RAND() * 30) + 10
                END as avg_attendees
            FROM 
                bookings b
            LEFT JOIN 
                venues v ON b.venue = v.name
            ${conditions.replace('WHERE', 'WHERE b.')}
            GROUP BY b.venue
        `;
        
        const capacityAnalysisResult = await conn.query(capacityAnalysisQuery, params);
        
        // Format capacity analysis results
        const capacityAnalysis = capacityAnalysisResult.map(item => {
            let capacity;
            switch(item.capacity_range) {
                case '0-50': capacity = 50; break;
                case '50-100': capacity = 100; break;
                case '100-150': capacity = 150; break;
                case '150-200': capacity = 200; break;
                case '200+': capacity = 250; break;
                default: capacity = 50;
            }
            
            const efficiency = Math.round((item.avg_attendees / capacity) * 100);
            
            return {
                venue: item.venue,
                capacity: item.capacity_range,
                avgAttendees: item.avg_attendees,
                efficiency: efficiency > 100 ? 100 : efficiency
            };
        });
        
        // Get department analysis
        const departmentAnalysisQuery = `
            SELECT 
                department,
                COUNT(*) as booking_count,
                (
                    SELECT venue 
                    FROM bookings b2 
                    WHERE b2.department = b1.department 
                    ${startDate && endDate ? 'AND b2.date BETWEEN ? AND ?' : ''}
                    GROUP BY venue 
                    ORDER BY COUNT(*) DESC 
                    LIMIT 1
                ) as most_used_venue,
                FLOOR(60 + RAND() * 60) as avg_duration,
                CONCAT(
                    6 + FLOOR(RAND() * 10),
                    ':00 AM'
                ) as peak_time
            FROM 
                bookings b1
            ${conditions}
            GROUP BY department
            ORDER BY booking_count DESC
        `;
        
        const departmentAnalysisParams = [...params];
        if (startDate && endDate) {
            departmentAnalysisParams.push(startDate, endDate);
        }
        
        const departmentAnalysisResult = await conn.query(departmentAnalysisQuery, departmentAnalysisParams);
        
        // Format department analysis
        const departmentAnalysis = departmentAnalysisResult.map(item => ({
            department: item.department || 'Unspecified',
            totalBookings: item.booking_count,
            mostUsedVenue: item.most_used_venue || 'N/A',
            avgDuration: item.avg_duration,
            peakTime: item.peak_time
        }));
        
        // Get booking history
        const bookingHistoryQuery = `
            SELECT 
                id,
                title,
                venue,
                date,
                TIME_FORMAT(time, '%h:%i %p') as time,
                username,
                department,
                CASE
                    WHEN department = 'Administration' THEN FLOOR(RAND() * 10) + 5
                    WHEN department = 'Faculty' THEN FLOOR(RAND() * 15) + 10
                    WHEN department = 'Student' THEN FLOOR(RAND() * 50) + 30
                    WHEN department = 'Clubs' THEN FLOOR(RAND() * 20) + 10
                    ELSE FLOOR(RAND() * 10) + 5
                END as attendees,
                projectorRequired,
                speakerRequired
            FROM 
                bookings
            ${conditions}
            ORDER BY date DESC, time DESC
            LIMIT 50
        `;
        
        const bookingHistoryResult = await conn.query(bookingHistoryQuery, params);
        
        // Compile and return all analytics data
        const analyticsData = {
            metrics: {
                totalBookings,
                utilizationRate,
                mostUsedVenue,
                peakBookingTime,
                bookingsTrend,
                utilizationTrend,
                mostUsedVenueBookings,
                peakTimePercentage
            },
            venueUtilization: {
                venues: venueUtilizationResult.map(item => item.venue),
                rates: venueUtilizationResult.map(item => parseFloat(item.utilization_rate.toFixed(1)))
            },
            departmentBookings: {
                departments: departmentBookingsResult.map(item => item.department || 'Other'),
                bookings: departmentBookingsResult.map(item => item.count)
            },
            bookingsTrend: {
                labels: bookingsTrendResult.map(item => item.label),
                values: bookingsTrendResult.map(item => item.count)
            },
            equipmentUsage: {
                equipment: equipmentUsageResult.map(item => item.equipment),
                usageCount: equipmentUsageResult.map(item => parseInt(item.count))
            },
            timeDistribution: {
                hours: timeDistributionResult.map(item => item.formatted_hour),
                counts: timeDistributionResult.map(item => item.count)
            },
            capacityAnalysis,
            departmentAnalysis,
            bookingHistory: bookingHistoryResult
        };
        
        res.json(analyticsData);
    } catch (error) {
        console.error('Error fetching analytics data:', error);
        res.status(500).json({ message: 'Error fetching analytics data', error: error.message });
    } finally {
        if (conn) conn.release();
    }
});
// This module contains functions to enhance data collection for analytics
// Add this to your server.js file or create a separate module

// Function to record booking completion data
async function recordBookingCompletion(bookingId, actualAttendees, duration, feedback) {
    let conn;
    try {
        conn = await pool.getConnection();
        
        // Update booking with actual metrics
        await conn.query(
            `UPDATE bookings 
             SET actual_attendees = ?, 
                 booking_duration = ?, 
                 status = 'completed', 
                 feedback_rating = ?, 
                 feedback_comment = ? 
             WHERE id = ?`,
            [actualAttendees, duration, feedback.rating, feedback.comment, bookingId]
        );
        
        console.log(`Updated booking ${bookingId} with completion data`);
        return { success: true };
    } catch (error) {
        console.error('Error recording booking completion:', error);
        return { success: false, error: error.message };
    } finally {
        if (conn) conn.release();
    }
}

// Function to record actual venue usage
async function recordVenueUsage(bookingId, actualStartTime, actualEndTime, equipmentUsed, issuesReported) {
    let conn;
    try {
        conn = await pool.getConnection();
        
        // Insert venue usage metrics
        await conn.query(
            `INSERT INTO venue_usage_metrics (
                booking_id, actual_start_time, actual_end_time, equipment_used, issues_reported
             ) VALUES (?, ?, ?, ?, ?)`,
            [bookingId, actualStartTime, actualEndTime, equipmentUsed, issuesReported]
        );
        
        console.log(`Recorded usage metrics for booking ${bookingId}`);
        return { success: true };
    } catch (error) {
        console.error('Error recording venue usage:', error);
        return { success: false, error: error.message };
    } finally {
        if (conn) conn.release();
    }
}

// Function to submit improvement request
async function submitImprovementRequest(venueId, requestedBy, requestType, description) {
    let conn;
    try {
        conn = await pool.getConnection();
        
        // Get venue name from ID
        const venueResult = await conn.query('SELECT name FROM venues WHERE id = ?', [venueId]);
        if (venueResult.length === 0) {
            return { success: false, error: 'Venue not found' };
        }
        
        const venueName = venueResult[0].name;
        
        // Insert improvement request
        await conn.query(
            `INSERT INTO venue_improvement_requests (
                venue_name, requested_by, request_type, description
             ) VALUES (?, ?, ?, ?)`,
            [venueName, requestedBy, requestType, description]
        );
        
        console.log(`Submitted improvement request for venue ${venueName}`);
        return { success: true };
    } catch (error) {
        console.error('Error submitting improvement request:', error);
        return { success: false, error: error.message };
    } finally {
        if (conn) conn.release();
    }
}

// Function to update venue capacity
async function updateVenueCapacity(venueName, newCapacityRange) {
    let conn;
    try {
        conn = await pool.getConnection();
        
        // Close the current capacity record
        await conn.query(
            `UPDATE venue_capacity_history 
             SET effective_to = CURRENT_DATE 
             WHERE venue_name = ? AND effective_to IS NULL`,
            [venueName]
        );
        
        // Insert new capacity record
        await conn.query(
            `INSERT INTO venue_capacity_history (venue_name, capacity_range, effective_from)
             VALUES (?, ?, DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY))`,
            [venueName, newCapacityRange]
        );
        
        console.log(`Updated capacity for venue ${venueName} to ${newCapacityRange}`);
        return { success: true };
    } catch (error) {
        console.error('Error updating venue capacity:', error);
        return { success: false, error: error.message };
    } finally {
        if (conn) conn.release();
    }
}

// Define API routes for data collection
function setupDataCollectionRoutes(app) {
    // Route for recording booking completion
    app.post('/api/bookings/:id/complete', async (req, res) => {
        const bookingId = req.params.id;
        const { actualAttendees, duration, feedback } = req.body;
        
        const result = await recordBookingCompletion(bookingId, actualAttendees, duration, feedback);
        
        if (result.success) {
            res.json({ message: 'Booking completion data recorded successfully' });
        } else {
            res.status(500).json({ message: 'Error recording booking completion', error: result.error });
        }
    });
    
    // Route for recording venue usage
    app.post('/api/bookings/:id/usage', async (req, res) => {
        const bookingId = req.params.id;
        const { actualStartTime, actualEndTime, equipmentUsed, issuesReported } = req.body;
        
        const result = await recordVenueUsage(
            bookingId, actualStartTime, actualEndTime, equipmentUsed, issuesReported
        );
        
        if (result.success) {
            res.json({ message: 'Venue usage metrics recorded successfully' });
        } else {
            res.status(500).json({ message: 'Error recording venue usage', error: result.error });
        }
    });
    
    // Route for submitting improvement requests
    app.post('/api/venues/:id/improvement', async (req, res) => {
        const venueId = req.params.id;
        const { requestedBy, requestType, description } = req.body;
        
        const result = await submitImprovementRequest(venueId, requestedBy, requestType, description);
        
        if (result.success) {
            res.json({ message: 'Improvement request submitted successfully' });
        } else {
            res.status(500).json({ message: 'Error submitting improvement request', error: result.error });
        }
    });
    
    // Route for updating venue capacity
    app.put('/api/venues/:name/capacity', async (req, res) => {
        const venueName = req.params.name;
        const { capacityRange } = req.body;
        
        const result = await updateVenueCapacity(venueName, capacityRange);
        
        if (result.success) {
            res.json({ message: 'Venue capacity updated successfully' });
        } else {
            res.status(500).json({ message: 'Error updating venue capacity', error: result.error });
        }
    });
}

module.exports = {
    recordBookingCompletion,
    recordVenueUsage,
    submitImprovementRequest,
    updateVenueCapacity,
    setupDataCollectionRoutes
};
// Analytics endpoints to add to your server.js file

// 1. Endpoint for dashboard analytics summary
app.get('/api/analytics/summary', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        
        // Get total users count
        const usersCount = await conn.query(
            "SELECT COUNT(*) as total FROM users"
        );
        
        // Get total bookings count
        const bookingsCount = await conn.query(
            "SELECT COUNT(*) as total FROM bookings"
        );
        
        // Get total venues count 
        const venuesCount = await conn.query(
            "SELECT COUNT(*) as total FROM venues"
        );
        
        // Get bookings for today
        const today = new Date().toISOString().split('T')[0];
        const todayBookings = await conn.query(
            "SELECT COUNT(*) as total FROM bookings WHERE date = ?",
            [today]
        );
        
        // Combine all stats into one response
        res.json({
            users: usersCount[0].total,
            totalBookings: bookingsCount[0].total,
            venues: venuesCount[0].total,
            todayBookings: todayBookings[0].total
        });
    } catch (err) {
        console.error('Analytics summary error:', err);
        res.status(500).json({ message: "Error fetching analytics summary", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// 2. Endpoint for bookings by venue
app.get('/api/analytics/bookings-by-venue', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        
        // Get bookings grouped by venue
        const bookingsByVenue = await conn.query(`
            SELECT 
                venue, 
                COUNT(*) as count 
            FROM bookings 
            GROUP BY venue 
            ORDER BY count DESC
        `);
        
        res.json(bookingsByVenue);
    } catch (err) {
        console.error('Bookings by venue error:', err);
        res.status(500).json({ message: "Error fetching bookings by venue", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// 3. Endpoint for bookings by department
app.get('/api/analytics/bookings-by-department', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        
        // Get bookings grouped by department
        const bookingsByDepartment = await conn.query(`
            SELECT 
                department, 
                COUNT(*) as count 
            FROM bookings 
            GROUP BY department 
            ORDER BY count DESC
        `);
        
        res.json(bookingsByDepartment);
    } catch (err) {
        console.error('Bookings by department error:', err);
        res.status(500).json({ message: "Error fetching bookings by department", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// 4. Endpoint for bookings trend over time
app.get('/api/analytics/bookings-trend', async (req, res) => {
    // Get period from query (day, week, month, year)
    const period = req.query.period || 'month';
    let groupBy, dateFormat;
    
    // Set grouping and formatting based on requested period
    switch(period) {
        case 'day':
            groupBy = "DATE(date)";
            dateFormat = "%Y-%m-%d";
            break;
        case 'week':
            groupBy = "YEARWEEK(date)";
            dateFormat = "%Y-%u"; // Year-Week
            break;
        case 'month':
            groupBy = "YEAR(date), MONTH(date)";
            dateFormat = "%Y-%m";
            break;
        case 'year':
            groupBy = "YEAR(date)";
            dateFormat = "%Y";
            break;
        default:
            groupBy = "DATE(date)";
            dateFormat = "%Y-%m-%d";
    }
    
    let conn;
    try {
        conn = await pool.getConnection();
        
        // Get bookings trend data
        const bookingsTrend = await conn.query(`
            SELECT 
                DATE_FORMAT(date, '${dateFormat}') as time_period,
                COUNT(*) as count 
            FROM bookings 
            GROUP BY ${groupBy}
            ORDER BY date
        `);
        
        res.json(bookingsTrend);
    } catch (err) {
        console.error('Bookings trend error:', err);
        res.status(500).json({ message: "Error fetching bookings trend", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// 5. Endpoint for equipment usage
app.get('/api/analytics/equipment-usage', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        
        // Get equipment usage statistics
        const equipmentUsage = await conn.query(`
            SELECT 
                SUM(projectorRequired = true) as projector_count,
                SUM(speakerRequired = true) as speaker_count,
                COUNT(*) as total_bookings
            FROM bookings
        `);
        
        res.json({
            projector: {
                count: equipmentUsage[0].projector_count,
                percentage: equipmentUsage[0].total_bookings > 0 ? 
                    Math.round((equipmentUsage[0].projector_count / equipmentUsage[0].total_bookings) * 100) : 0
            },
            speaker: {
                count: equipmentUsage[0].speaker_count,
                percentage: equipmentUsage[0].total_bookings > 0 ? 
                    Math.round((equipmentUsage[0].speaker_count / equipmentUsage[0].total_bookings) * 100) : 0
            },
            total: equipmentUsage[0].total_bookings
        });
    } catch (err) {
        console.error('Equipment usage error:', err);
        res.status(500).json({ message: "Error fetching equipment usage", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// 6. Endpoint for peak booking times
app.get('/api/analytics/peak-times', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        
        // Extract hour from booking time and group by it
        const peakTimes = await conn.query(`
            SELECT 
                HOUR(time) as hour,
                COUNT(*) as count 
            FROM bookings 
            GROUP BY HOUR(time) 
            ORDER BY count DESC
        `);
        
        // Calculate total bookings for percentage
        const totalBookings = await conn.query(
            "SELECT COUNT(*) as total FROM bookings"
        );
        
        // Add percentage to each time slot
        const result = peakTimes.map(slot => ({
            hour: slot.hour,
            count: slot.count,
            percentage: Math.round((slot.count / totalBookings[0].total) * 100)
        }));
        
        res.json(result);
    } catch (err) {
        console.error('Peak times error:', err);
        res.status(500).json({ message: "Error fetching peak booking times", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// 7. Endpoint for all analytics data in a single request
app.get('/api/analytics/dashboard', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        
        // Summary counts
        const countQueries = await Promise.all([
            conn.query("SELECT COUNT(*) as total FROM users"),
            conn.query("SELECT COUNT(*) as total FROM bookings"),
            conn.query("SELECT COUNT(*) as total FROM venues")
        ]);
        
        // Bookings by venue
        const bookingsByVenue = await conn.query(`
            SELECT venue, COUNT(*) as count 
            FROM bookings 
            GROUP BY venue 
            ORDER BY count DESC
        `);
        
        // Bookings by department
        const bookingsByDepartment = await conn.query(`
            SELECT department, COUNT(*) as count 
            FROM bookings 
            GROUP BY department 
            ORDER BY count DESC
        `);
        
        // Equipment usage
        const equipmentUsage = await conn.query(`
            SELECT 
                SUM(projectorRequired = true) as projector_count,
                SUM(speakerRequired = true) as speaker_count,
                COUNT(*) as total_bookings
            FROM bookings
        `);
        
        // Peak booking times
        const peakTimes = await conn.query(`
            SELECT 
                HOUR(time) as hour,
                COUNT(*) as count 
            FROM bookings 
            GROUP BY HOUR(time) 
            ORDER BY count DESC
            LIMIT 1
        `);
        
        // Monthly trend (past 6 months)
        const monthlyTrend = await conn.query(`
            SELECT 
                DATE_FORMAT(date, '%Y-%m') as month,
                COUNT(*) as count 
            FROM bookings 
            WHERE date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
            GROUP BY YEAR(date), MONTH(date)
            ORDER BY YEAR(date), MONTH(date)
        `);
        
        // Most active user
        const mostActiveUser = await conn.query(`
            SELECT 
                username, 
                COUNT(*) as booking_count 
            FROM bookings 
            GROUP BY username 
            ORDER BY booking_count DESC 
            LIMIT 1
        `);
        
        // Compile all data into a dashboard object
        res.json({
            summary: {
                users: countQueries[0][0].total,
                bookings: countQueries[1][0].total,
                venues: countQueries[2][0].total
            },
            bookingsByVenue: bookingsByVenue,
            bookingsByDepartment: bookingsByDepartment,
            equipmentUsage: {
                projector: {
                    count: equipmentUsage[0].projector_count,
                    percentage: equipmentUsage[0].total_bookings > 0 ? 
                        Math.round((equipmentUsage[0].projector_count / equipmentUsage[0].total_bookings) * 100) : 0
                },
                speaker: {
                    count: equipmentUsage[0].speaker_count,
                    percentage: equipmentUsage[0].total_bookings > 0 ? 
                        Math.round((equipmentUsage[0].speaker_count / equipmentUsage[0].total_bookings) * 100) : 0
                }
            },
            peakBookingTime: peakTimes.length > 0 ? {
                hour: peakTimes[0].hour,
                count: peakTimes[0].count
            } : null,
            monthlyTrend: monthlyTrend,
            mostActiveUser: mostActiveUser.length > 0 ? mostActiveUser[0] : null
        });
    } catch (err) {
        console.error('Dashboard analytics error:', err);
        res.status(500).json({ message: "Error fetching dashboard analytics", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});
// Start Server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`View application at http://localhost:${port}/`);
});
