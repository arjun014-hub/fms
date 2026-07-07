require('dotenv').config();
const mysql = require('mysql2');

// Connect using the same secure settings as your server
const db = mysql.createConnection({
    uri: process.env.DB_URI,
    ssl: { rejectUnauthorized: false }
});

db.connect((err) => {
    if (err) {
        console.error("Connection failed:", err);
        process.exit(1);
    }
    console.log("Connected to new database. Creating tables...");

    const tableQueries = [
        `CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS plots (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            plot_name VARCHAR(255) NOT NULL,
            pruning_type VARCHAR(50),
            pruning_date DATE,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`,
        `CREATE TABLE IF NOT EXISTS schedules (
            id INT AUTO_INCREMENT PRIMARY KEY,
            plot_id INT NOT NULL,
            day_number INT NOT NULL,
            schedule_date DATE,
            spray_time VARCHAR(50),
            spray_water_qty INT,
            spray_chemicals TEXT,
            fert_time VARCHAR(50),
            fert_water_qty INT,
            fert_items TEXT,
            labor_workers INT,
            labor_charges INT,
            FOREIGN KEY (plot_id) REFERENCES plots(id)
        )`,
        `CREATE TABLE IF NOT EXISTS preplanned_schedules (
            id INT AUTO_INCREMENT PRIMARY KEY,
            plot_id INT NOT NULL,
            day_number INT NOT NULL,
            planned_spray TEXT,
            planned_fert TEXT,
            FOREIGN KEY (plot_id) REFERENCES plots(id)
        )`,
        `CREATE TABLE IF NOT EXISTS vault_files (
            id INT AUTO_INCREMENT PRIMARY KEY,
            plot_id INT NOT NULL,
            file_name VARCHAR(255) NOT NULL,
            file_path VARCHAR(500) NOT NULL,
            file_type VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (plot_id) REFERENCES plots(id)
        )`
    ];

    let completed = 0;
    tableQueries.forEach(query => {
        db.query(query, (err) => {
            if (err) {
                console.error("Error creating table:", err);
            } else {
                completed++;
                if (completed === tableQueries.length) {
                    console.log("All tables created successfully! You can now start your server.");
                    process.exit(0);
                }
            }
        });
    });
});