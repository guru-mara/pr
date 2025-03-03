        // backend.js
        const express = require('express');
        const mariadb = require('mariadb');
        const cors = require('cors');
        const path = require('path');

        const app = express();
        const port = 3004;

        // Middleware
        app.use(cors());
        app.use(express.json());

        // Serve static files with proper config
        app.use(express.static('public', {
            index: 'auth.html'
        }));

        // Route handler to force auth.html as the initial page
        app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'auth.html'));
        });

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
                date DATE NOT NULL,
                time TIME NOT NULL,
                username VARCHAR(255) NOT NULL,
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
        app.post('/signup', async (req, res) => {
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

                await conn.query("INSERT INTO users (username, password) VALUES (?, ?)", 
                    [username, password]);

                res.json({ message: "Signup successful! Please login." });
            } catch (err) {
                res.status(500).json({ message: "Error signing up", error: err.message });
            } finally {
                if (conn) conn.release();
            }
        });

        // Login Route
        app.post('/login', async (req, res) => {
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({ message: "Username and password are required" });
            }

            let conn;
            try {
                conn = await pool.getConnection();
                const user = await conn.query("SELECT * FROM users WHERE username = ? AND password = ?", [username, password]);

                if (user.length === 0) {
                    return res.status(401).json({ message: "Invalid username or password." });
                }

                res.json({ message: "Login successful!", user: { username } });
            } catch (err) {
                res.status(500).json({ message: "Error logging in", error: err.message });
            } finally {
                if (conn) conn.release();
            }
        });

        // Add Booking
        app.post('/bookings', async (req, res) => {
            console.log('Received booking request:', req.body);
            const { venue, date, time, username } = req.body;
            
            if (!venue || !date || !time || !username) {
                return res.status(400).json({ message: "Venue, date, time and username are required" });
            }
            
            try {
                const bookingHour = parseInt(time.split(':')[0]);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const bookingDate = new Date(date);
                bookingDate.setHours(0, 0, 0, 0);
                
                console.log('Validating booking:', {
                    bookingHour,
                    today: today.toISOString(),
                    bookingDate: bookingDate.toISOString()
                });

                if (bookingHour < 6 || bookingHour > 20) {
                    return res.status(400).json({ message: "Bookings allowed only between 6 AM and 8 PM." });
                }

                if (bookingDate < today) {
                    return res.status(400).json({ message: "Bookings can only be made from today onwards." });
                }

                let conn;
                try {
                    conn = await pool.getConnection();
                    console.log('Checking for existing bookings...');

                    const existing = await conn.query(
                        `SELECT * FROM bookings 
                        WHERE venue = ? 
                        AND date = ? 
                        AND HOUR(time) = HOUR(?)`, 
                        [venue, date, time]
                    );

                    console.log('Existing bookings:', existing);

                    if (existing.length > 0) {
                        return res.status(400).json({ message: "Venue is already booked at this time. Please choose another slot." });
                    }

                    console.log('Inserting new booking...');
                    await conn.query(
                        "INSERT INTO bookings (venue, date, time, username) VALUES (?, ?, ?, ?)", 
                        [venue, date, time, username]
                    );

                    console.log('Booking successful');
                    res.json({ message: "Booking successful!" });
                } finally {
                    if (conn) {
                        conn.release();
                        console.log('Database connection released');
                    }
                }
            } catch (err) {
                console.error('Booking error:', err);
                res.status(500).json({ message: "Error booking venue", error: err.message });
            }
        });

        // Delete Booking
        app.delete('/bookings/:id', async (req, res) => {
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
                res.status(500).json({ message: "Error deleting booking", error: err.message });
            } finally {
                if (conn) conn.release();
            }
        });

        // Get Bookings
        app.get('/bookings', async (req, res) => {
            const username = req.query.username;
            let conn;
            try {
                conn = await pool.getConnection();
                
                let query = `
                    SELECT 
                        id, 
                        venue, 
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

                const formattedBookings = results.map(b => ({
                    id: b.id,
                    title: `${b.venue} (${b.time})${username ? '' : ` - ${b.username}`}`,
                    start: `${b.date}T${b.time}`,
                    username: b.username
                }));

                res.json(formattedBookings);
            } catch (err) {
                res.status(500).json({ message: "Error fetching bookings", error: err.message });
            } finally {
                if (conn) conn.release();
            }
        });

        // Start Server
        app.listen(port, () => {
            console.log(`Server running at http://localhost:${port}`);
            console.log(`View application at http://localhost:${port}/`);
        });