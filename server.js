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

// Function to handle BigInt serialization in database results
function processDatabaseResults(results) {
    if (Array.isArray(results)) {
        return results.map(row => {
            const processedRow = {};
            for (const key in row) {
                if (typeof row[key] === 'bigint') {
                    processedRow[key] = Number(row[key]);
                } else {
                    processedRow[key] = row[key];
                }
            }
            return processedRow;
        });
    } else if (results && typeof results === 'object') {
        const processedResults = {};
        for (const key in results) {
            if (typeof results[key] === 'bigint') {
                processedResults[key] = Number(results[key]);
            } else {
                processedResults[key] = results[key];
            }
        }
        return processedResults;
    }
    return results;
}

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
        password VARCHAR(255) NOT NULL
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

// Initialize Database Tables
(async () => {
    let conn;
    try {
        conn = await pool.getConnection();
        await createUsersTable(conn);
        await createBookingsTable(conn);
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
    const { title, venue, date, time, username, department, projectorRequired, speakerRequired } = req.body;
    
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

            // Include department, projector and speaker requirements in the query
            await conn.query(
                "INSERT INTO bookings (title, venue, date, time, username, department, projectorRequired, speakerRequired) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", 
                [title, venue, date, time, username, department || null, projectorRequired || false, speakerRequired || false]
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

        const existing = await conn.query(
            "SELECT * FROM bookings WHERE id = ? AND username = ?", 
            [bookingId, username]
        );
        
        if (existing.length === 0) {
            return res.status(403).json({ message: "Booking not found or you don't have permission to delete it." });
        }

        await conn.query("DELETE FROM bookings WHERE id = ? AND username = ?", [bookingId, username]);
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
                username
            FROM bookings
        `;
        
        let params = [];
        if (username) {
            query += " WHERE username = ?";
            params.push(username);
        }
        
        const results = await conn.query(query, params);
        const processedResults = processDatabaseResults(results);

        // For debugging - log what's coming from the database
        console.log("Database results:", processedResults);

        const formattedBookings = processedResults.map(b => ({
            id: b.id,
            title: b.title,
            venue: b.venue,
            department: b.department,
            start: `${b.date}T${b.time}`,
            time: b.time,
            username: b.username,
            bookedBy: b.username
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

// Get bookings by venue
app.get('/api/bookings/by-venue', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const query = `
            SELECT venue, COUNT(*) as count
            FROM bookings
            GROUP BY venue
            ORDER BY count DESC
        `;
        
        const results = await conn.query(query);
        const processedResults = processDatabaseResults(results);
        
        res.json(processedResults);
    } catch (err) {
        console.error('Bookings by venue error:', err);
        res.status(500).json({ message: "Error fetching venue statistics", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// Get bookings by department
app.get('/api/bookings/by-department', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const query = `
            SELECT department, COUNT(*) as count
            FROM bookings
            WHERE department IS NOT NULL
            GROUP BY department
            ORDER BY count DESC
        `;
        
        const results = await conn.query(query);
        const processedResults = processDatabaseResults(results);
        
        res.json(processedResults);
    } catch (err) {
        console.error('Bookings by department error:', err);
        res.status(500).json({ message: "Error fetching department statistics", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// Analytics endpoints for dashboard
app.get('/api/analytics/bookings-by-venue', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const query = `
            SELECT venue, COUNT(*) as count
            FROM bookings
            GROUP BY venue
            ORDER BY count DESC
            LIMIT 5
        `;
        
        const results = await conn.query(query);
        const processedResults = processDatabaseResults(results);
        
        res.json(processedResults);
    } catch (err) {
        console.error('Analytics bookings by venue error:', err);
        res.status(500).json({ message: "Error fetching venue analytics", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

app.get('/api/analytics/bookings-by-department', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const query = `
            SELECT department, COUNT(*) as count
            FROM bookings
            WHERE department IS NOT NULL
            GROUP BY department
            ORDER BY count DESC
            LIMIT 5
        `;
        
        const results = await conn.query(query);
        const processedResults = processDatabaseResults(results);
        
        res.json(processedResults);
    } catch (err) {
        console.error('Analytics bookings by department error:', err);
        res.status(500).json({ message: "Error fetching department analytics", error: err.message });
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
        const users = await conn.query("SELECT username, 'user' as role FROM users");
        const processedUsers = processDatabaseResults(users);
        res.json(processedUsers);
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

// Create venues table if it doesn't exist
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

// Initialize venues table
(async () => {
    let conn;
    try {
        conn = await pool.getConnection();
        await createVenuesTable(conn);
        console.log("Venues table initialized successfully.");
    } catch (err) {
        console.error('Venues table setup error:', err);
    } finally {
        if (conn) conn.release();
    }
})();

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
            [name, capacity, hasProjector || false, hasSpeaker || false, 'available']
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
        const processedVenues = processDatabaseResults(venues);
        res.json(processedVenues);
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
        
        // Check if there are bookings using this venue
        const bookings = await conn.query("SELECT COUNT(*) as count FROM bookings WHERE venue = (SELECT name FROM venues WHERE id = ?)", [venueId]);
        const bookingCount = processDatabaseResults(bookings)[0].count;
        
        if (bookingCount > 0) {
            return res.status(400).json({ message: "Cannot delete venue with active bookings" });
        }
        
        // Delete the venue
        const result = await conn.query("DELETE FROM venues WHERE id = ?", [venueId]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Venue not found" });
        }
        
        res.json({ message: "Venue deleted successfully" });
    } catch (err) {
        console.error('Delete venue error:', err);
        res.status(500).json({ message: "Error deleting venue", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// Get booking statistics for dashboard
app.get('/api/stats/bookings', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        
        // Total bookings
        const totalBookingsQuery = await conn.query("SELECT COUNT(*) as count FROM bookings");
        const totalBookings = processDatabaseResults(totalBookingsQuery)[0].count;
        
        // Bookings per day (last 7 days)
        const last7DaysQuery = await conn.query(`
            SELECT DATE_FORMAT(date, '%Y-%m-%d') as booking_date, COUNT(*) as count 
            FROM bookings 
            WHERE date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) 
            GROUP BY booking_date 
            ORDER BY booking_date
        `);
        const last7Days = processDatabaseResults(last7DaysQuery);
        
        // Top 5 venues by booking count
        const topVenuesQuery = await conn.query(`
            SELECT venue, COUNT(*) as count 
            FROM bookings 
            GROUP BY venue 
            ORDER BY count DESC 
            LIMIT 5
        `);
        const topVenues = processDatabaseResults(topVenuesQuery);
        
        // Top departments
        const topDepartmentsQuery = await conn.query(`
            SELECT department, COUNT(*) as count 
            FROM bookings 
            WHERE department IS NOT NULL
            GROUP BY department 
            ORDER BY count DESC 
            LIMIT 5
        `);
        const topDepartments = processDatabaseResults(topDepartmentsQuery);
        
        res.json({
            totalBookings,
            last7Days,
            topVenues,
            topDepartments
        });
    } catch (err) {
        console.error('Booking stats error:', err);
        res.status(500).json({ message: "Error fetching booking statistics", error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// UPDATED Analytics dashboard endpoint
app.get('/api/analytics/dashboard', async (req, res) => {
    const period = req.query.period || 'month';
    let conn;
    try {
        conn = await pool.getConnection();
        
        // Determine date range based on period
        let dateInterval;
        switch (period) {
            case 'week':
                dateInterval = 'INTERVAL 7 DAY';
                break;
            case 'month':
                dateInterval = 'INTERVAL 30 DAY';
                break;
            case 'quarter':
                dateInterval = 'INTERVAL 90 DAY';
                break;
            case 'year':
                dateInterval = 'INTERVAL 365 DAY';
                break;
            default:
                dateInterval = 'INTERVAL 30 DAY';
        }
        
        // Monthly trend data 
        const monthlyTrendQuery = await conn.query(`
            SELECT DATE_FORMAT(date, '%Y-%m') as month, COUNT(*) as count 
            FROM bookings 
            WHERE date >= DATE_SUB(CURDATE(), ${dateInterval})
            GROUP BY month 
            ORDER BY month
        `);
        const monthlyTrend = processDatabaseResults(monthlyTrendQuery);
        
        // Bookings by venue
        const bookingsByVenueQuery = await conn.query(`
            SELECT venue, COUNT(*) as count
            FROM bookings
            WHERE date >= DATE_SUB(CURDATE(), ${dateInterval})
            GROUP BY venue
            ORDER BY count DESC
        `);
        const bookingsByVenue = processDatabaseResults(bookingsByVenueQuery);
        
        // Bookings by department
        const bookingsByDepartmentQuery = await conn.query(`
            SELECT department, COUNT(*) as count
            FROM bookings
            WHERE department IS NOT NULL AND date >= DATE_SUB(CURDATE(), ${dateInterval})
            GROUP BY department
            ORDER BY count DESC
        `);
        const bookingsByDepartment = processDatabaseResults(bookingsByDepartmentQuery);
        
        // Equipment usage data
        const equipmentUsageQuery = await conn.query(`
            SELECT 
                SUM(CASE WHEN projectorRequired = TRUE THEN 1 ELSE 0 END) as projector_count,
                SUM(CASE WHEN speakerRequired = TRUE THEN 1 ELSE 0 END) as speaker_count,
                COUNT(*) as total_count
            FROM bookings
            WHERE date >= DATE_SUB(CURDATE(), ${dateInterval})
        `);
        const equipmentData = processDatabaseResults(equipmentUsageQuery)[0];
        
        const projectorPercentage = equipmentData.total_count > 0 
            ? Math.round((equipmentData.projector_count / equipmentData.total_count) * 100) 
            : 0;
            
        const speakerPercentage = equipmentData.total_count > 0 
            ? Math.round((equipmentData.speaker_count / equipmentData.total_count) * 100) 
            : 0;
        
        // Most popular venue
        const popularVenue = bookingsByVenue.length > 0 ? bookingsByVenue[0] : { venue: 'N/A', count: 0 };
        
        // Peak booking time
        const peakTimeQuery = await conn.query(`
            SELECT HOUR(time) as hour, COUNT(*) as count, 
                   (COUNT(*) / (SELECT COUNT(*) FROM bookings WHERE date >= DATE_SUB(CURDATE(), ${dateInterval}))) * 100 as percentage
            FROM bookings
            WHERE date >= DATE_SUB(CURDATE(), ${dateInterval})
            GROUP BY HOUR(time)
            ORDER BY count DESC
            LIMIT 1
        `);
        const peakTime = processDatabaseResults(peakTimeQuery)[0] || { hour: 9, count: 0, percentage: 0 };
        
        // Top department
        const topDepartment = bookingsByDepartment.length > 0 ? bookingsByDepartment[0] : { department: 'N/A', count: 0 };
        
        // Most active user
        const activeUserQuery = await conn.query(`
            SELECT username, COUNT(*) as bookingCount
            FROM bookings
            WHERE date >= DATE_SUB(CURDATE(), ${dateInterval})
            GROUP BY username
            ORDER BY bookingCount DESC
            LIMIT 1
        `);
        const activeUser = processDatabaseResults(activeUserQuery)[0] || { username: 'N/A', bookingCount: 0 };
        
        // Log the analytics data being sent to client
        console.log('Sending analytics data:', {
            monthlyTrend: monthlyTrend.length,
            bookingsByVenue: bookingsByVenue.length,
            popularVenue,
            peakTime,
            topDepartment,
            activeUser
        });
        
        res.json({
            monthlyTrend,
            bookingsByVenue, 
            bookingsByDepartment,
            equipmentUsage: {
                projector: {
                    count: equipmentData.projector_count,
                    percentage: projectorPercentage
                },
                speaker: {
                    count: equipmentData.speaker_count,
                    percentage: speakerPercentage
                }
            },
            popularVenue,
            peakTime,
            topDepartment,
            activeUser
        });
    } catch (err) {
        console.error('Analytics dashboard error:', err);
        // Send a more detailed error response for debugging
        res.status(500).json({ 
            message: "Error fetching analytics dashboard data", 
            error: err.message,
            stack: err.stack
        });
    } finally {
        if (conn) conn.release();
    }
});

// Start Server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`View application at http://localhost:${port}/`);
});