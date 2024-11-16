const PORT = 3500;

const mysql = require("mysql");
const express = require("express");
const path = require("path");

const app = express();

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/", (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.ip
    trackVisit(ip)
    res.sendFile(path.join(__dirname, "/public/login.html"));
});

const connection = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "cybercrime"
});

let visitCount = 0;


const initializeVisitCount = () => {
    connection.query("SELECT SUM(count) AS totalVisits FROM keepcounter", (err, results) => {
        if (err) {
            console.error("Error reading visit count:", err);
            visitCount = 0;
        } else {
            visitCount = results[0].totalVisits || 0;
            console.log("Initial visit count:", visitCount);
        }
    });
};

const shouldCountVisit = (ip, callback) => {
    const oneDayInMs = 24 * 60 * 60 * 1000;
    const currentTime = new Date();

    connection.query("SELECT updated FROM keepcounter WHERE ip = ?", [ip], (err, results) => {
        if (err) {
            console.error("Database query error:", err);
            return callback(false);
        }

        if (results.length > 0) {
            const lastVisitTime = new Date(results[0].updated);
            const timeDiff = currentTime - lastVisitTime;

            // If the last visit was more than a day ago, count as a new visit
            if (timeDiff >= oneDayInMs) {
                callback(true);
            } else {
                callback(false);
            }
        } else {
            // No entry for this IP, so count as a new visit
            callback(true);
        }
    });
};

const trackVisit = (ip) => {
    shouldCountVisit(ip, (isNewVisit) => {
        if (isNewVisit) {
            visitCount++; // Increment total visits

            // Check if IP already exists in the database
            connection.query("SELECT count FROM keepcounter WHERE ip = ?", [ip], (err, results) => {
                if (err) {
                    console.error("Error querying database:", err);
                    return;
                }

                if (results.length > 0) {
                    // IP exists, so increment the count and update timestamp
                    const newCount = results[0].count + 1;
                    connection.query(
                        "UPDATE keepcounter SET count = ?, updated = NOW() WHERE ip = ?",
                        [newCount, ip],
                        (err) => {
                            if (err) {
                                console.error("Error updating visit count:", err);
                            } else {
                                console.log(`Visit count updated for IP ${ip}: ${newCount} visits`);
                            }
                        }
                    );
                } else {
                    // New IP, so insert into the database
                    connection.query(
                        "INSERT INTO keepcounter (ip, count, updated) VALUES (?, 1, NOW())",
                        [ip],
                        (err) => {
                            if (err) {
                                console.error("Error inserting new IP visit:", err);
                            } else {
                                console.log(`New IP visit counted for IP ${ip}`);
                            }
                        }
                    );
                }
            });
        } else {
            console.log(`IP ${ip} already visited today, not counting`);
        }
    });
};

// Initialize the visit count when the server starts
initializeVisitCount();

module.exports = { trackVisit, visitCount };

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});