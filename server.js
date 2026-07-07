const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// 1. CLOUD CONFIGURATION (PASTE YOUR KEYS HERE)
// ==========================================

// Cloudinary Setup
cloudinary.config({
cloud_name: process.env.CLOUDINARY_NAME,
api_key: process.env.CLOUDINARY_API_KEY,
api_secret: process.env.CLOUDINARY_API_SECRET
});

// Aiven MySQL Connection
const dbUri = process.env.DB_URI;
const db = mysql.createConnection(dbUri);

db.connect((err) => {
    if (err) {
        console.error('Error connecting to live database:', err);
        return;
    }
    console.log('Successfully connected to Aiven MySQL Database');
});

// ==========================================
// 2. CLOUD FILE STORAGE SETUP
// ==========================================
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'grape_farm_vault', 
        resource_type: 'auto', // Allows PDFs, CSVs, and images
        allowed_formats: ['jpg', 'png', 'pdf', 'csv', 'xlsx']
    },
});

const upload = multer({ storage: storage });

// ==========================================
// 3. AUTHENTICATION API
// ==========================================
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    const query = 'INSERT INTO users (username, password) VALUES (?, ?)';
    db.query(query, [username, password], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'User registered successfully!' });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const query = 'SELECT * FROM users WHERE username = ? AND password = ?';
    db.query(query, [username, password], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length > 0) {
            res.json({ message: 'Login successful', user: { id: results[0].id, username: results[0].username } });
        } else {
            res.status(401).json({ error: 'Invalid username or password' });
        }
    });
});

// ==========================================
// 4. PLOT MANAGEMENT API
// ==========================================
app.post('/api/plots', (req, res) => {
    const { userId, plotName, pruningType, pruningDate } = req.body;
    const query = 'INSERT INTO plots (user_id, plot_name, pruning_type, pruning_date) VALUES (?, ?, ?, ?)';
    db.query(query, [userId, plotName, pruningType, pruningDate], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Plot created successfully!', plotId: result.insertId });
    });
});

app.get('/api/plots/:userId', (req, res) => {
    const query = `
        SELECT 
            p.id, p.plot_name, p.pruning_type, DATE_FORMAT(p.pruning_date, "%Y-%m-%d") as pruning_date,
            COALESCE(SUM(s.labor_charges), 0) as total_labor
        FROM plots p
        LEFT JOIN schedules s ON p.id = s.plot_id
        WHERE p.user_id = ?
        GROUP BY p.id
    `;
    db.query(query, [req.params.userId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// ==========================================
// 5. SCHEDULE (ACTUAL WORK) API
// ==========================================
app.post('/api/schedules', (req, res) => {
    const { plotId, dayNumber, scheduleDate, sprayTime, sprayWaterQty, sprayChemicals, fertTime, fertWaterQty, fertItems, laborWorkers, laborCharges } = req.body;
    const deleteQuery = 'DELETE FROM schedules WHERE plot_id = ? AND day_number = ?';
    
    db.query(deleteQuery, [plotId, dayNumber], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        const insertQuery = 'INSERT INTO schedules (plot_id, day_number, schedule_date, spray_time, spray_water_qty, spray_chemicals, fert_time, fert_water_qty, fert_items, labor_workers, labor_charges) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        db.query(insertQuery, [plotId, dayNumber, scheduleDate, sprayTime, sprayWaterQty, sprayChemicals, fertTime, fertWaterQty, fertItems, laborWorkers, laborCharges], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Schedule saved successfully' });
        });
    });
});

app.get('/api/schedules/:plotId', (req, res) => {
    const query = 'SELECT * FROM schedules WHERE plot_id = ?';
    db.query(query, [req.params.plotId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// ==========================================
// 6. PRE-PLANNED SCHEDULE API
// ==========================================
app.post('/api/preplan', (req, res) => {
    const { plotId, dayNumber, plannedSpray, plannedFert } = req.body;
    const deleteQuery = 'DELETE FROM preplanned_schedules WHERE plot_id = ? AND day_number = ?';
    db.query(deleteQuery, [plotId, dayNumber], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        const insertQuery = 'INSERT INTO preplanned_schedules (plot_id, day_number, planned_spray, planned_fert) VALUES (?, ?, ?, ?)';
        db.query(insertQuery, [plotId, dayNumber, plannedSpray, plannedFert], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Plan saved successfully' });
        });
    });
});

app.get('/api/preplan/:plotId', (req, res) => {
    const query = 'SELECT * FROM preplanned_schedules WHERE plot_id = ?';
    db.query(query, [req.params.plotId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// ==========================================
// 7. DOCUMENT VAULT (CLOUD UPLOAD) API
// ==========================================
app.post('/api/vault/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const plotId = req.body.plotId;
    const fileName = req.file.originalname;
    
    // Cloudinary returns the live URL in req.file.path
    const fileUrl = req.file.path; 
    
    // Determine type for the UI badge
    const ext = path.extname(fileName).toUpperCase().replace('.', '');
    let fileType = 'DOC';
    if (['PDF'].includes(ext)) fileType = 'PDF';
    else if (['CSV', 'XLSX'].includes(ext)) fileType = 'CSV';
    else if (['JPG', 'JPEG', 'PNG'].includes(ext)) fileType = 'JPG';

    const query = 'INSERT INTO vault_files (plot_id, file_name, file_path, file_type) VALUES (?, ?, ?, ?)';
    db.query(query, [plotId, fileName, fileUrl, fileType], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'File uploaded to Cloudinary securely', fileUrl: fileUrl });
    });
});

app.get('/api/vault/:plotId', (req, res) => {
    const query = 'SELECT * FROM vault_files WHERE plot_id = ? ORDER BY uploaded_at DESC';
    db.query(query, [req.params.plotId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// ==========================================
// SERVER START
// ==========================================
// Render uses process.env.PORT automatically. We default to 3000 for local testing.
// Serve static files from the current directory
app.use(express.static(__dirname));

// Send index.html when the root URL is accessed
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// app.get('/api/plots', ...);
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});