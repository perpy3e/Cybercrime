const PORT = 3500;

const express = require("express");
const session = require("express-session");
const fs = require("fs");
const path = require("path");
var mysql = require("mysql");
var bodyParser = require("body-parser");
const nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');
var bcrypt = require('bcrypt');

const app = express();

const counterfile = path.join(__dirname, "counter.txt");
const ipLogFile = path.join(__dirname, "ip_log.json");

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


let visitCount = 0; //read counter

if (fs.existsSync(counterfile)) {
    const data = fs.readFileSync(counterfile, "utf-8");
    visitCount = parseInt(data, 10) || 0;
}

let ipLogs = {}; //read ip-logs
if (fs.existsSync(ipLogFile)) {
    ipLogs = JSON.parse(fs.readFileSync(ipLogFile, "utf-8"));
}

const shouldCountVisit = (ip) => {
    const currentTime = Date.now();
    const date = new Date(currentTime);

    connection.query(
        "SELECT updated FROM keepcounter WHERE id = ?",
        [ip], (err, results) => {
            if (err) {
                console.error("Database query error:", err);
                return callback(false);
            }


            if (results.length === 0) {
                // IP not found in database, so count as a new visit
                return callback(true);
            }

            // Get the last visit time from the database
            const lastVisitTime = new Date(results[0].updated);
            const oneDay = 24 * 60 * 60 * 1000;

            // Check if the last visit was over a day ago
            if (currentTime - lastVisitTime >= oneDay) {
                return callback(true); // Last visit was on a different day, so count as a new visit
            }

            return callback(false); // Last visit was today, so don't count
        }
    )

};

app.get("/api/visits", (req, res) => {
    const userIP = req.ip;

    console.log("user ip:", userIP)
    const currentTime = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    connection.query(
        "SELECT count, updated FROM keepcounter WHERE ip = ?",
        [userIP], (err, results) => {
            if (err) {
                console.error("Database query error:", err);
                return res.status(500).send("Database error");
            }

            if (results.length === 0) {
                // IP not found in database, insert as a new visit
                connection.query(
                    "INSERT INTO keepcounter (ip, count, updated) VALUES (?, 1, NOW())",
                    [userIP],
                    (err) => {
                        if (err) {
                            console.error("Error inserting new IP visit:", err);
                            return res.status(500).send("Error inserting new IP visit");
                        }
                        console.log(`New IP visit counted for IP ${userIP}`);
                        sendTotalVisitCount(res, 1);
                        // res.json({ message: "New visit counted", count: 1 });
                    }
                );
            } else {
                const lastVisitTime = new Date(results[0].updated);

                if (currentTime - lastVisitTime.getTime() >= oneDay) {
                    // Last visit was over a day ago, so increment count and update timestamp
                    const newCount = results[0].count + 1;
    
                    connection.query(
                        "UPDATE keepcounter SET count = ?, updated = NOW() WHERE ip = ?",
                        [newCount, userIP],
                        (err) => {
                            if (err) {
                                console.error("Error updating visit count:", err);
                                return res.status(500).send("Error updating visit count");
                            }
                            console.log(`Visit count updated for IP ${userIP}: ${newCount} visits`);
                            sendTotalVisitCount(res, newCount);
                            // res.json({ message: "Visit counted", count: newCount });
                        }
                    );
                } else {
                    // Last visit was within the same day, do not increment count
                    console.log(`IP ${userIP} already visited today, not counting`);
                    sendTotalVisitCount(res, results[0].count);
                    // res.json({ message: "Visit already counted today", count: results[0].count });
                }
            }

            
        }
    );

    const sendTotalVisitCount = (res, userCount) => {
        connection.query("SELECT SUM(count) AS totalCount FROM keepcounter", (err, results) => {
            if (err) {
                console.error("Error retrieving total visit count:", err);
                return res.status(500).send("Error retrieving total visit count");
            }
    
            const totalCount = results[0].totalCount || 0;
            console.log(userCount,"+",totalCount)
            res.json({ message: "Visit count retrieved", userCount, totalCount });
        });
    };

});




//------------------- count IP ------------

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "/public/login.html"));
});

app.use(
    session({
        secret: "COSCI",
        cookie: { maxAge: 60000000 },
        resave: true,
        saveUninitialized: true,
    })
);

var connection = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "cybercrime"
});

app.get("/login", function (req, res) {
    res.sendFile(path.join(__dirname + "/public/login.html"));
})

app.post("/login", function (req, res) {
    var username = req.body.username;
    var password = req.body.password;

    console.log("----Login section start----")
    console.log("Username:", username);
    console.log("Password:", password);
    console.log("----Login section end----")

    // Check if the user is already logged in
    if (req.session.isLoggedIn && req.session.isLoggedIn === true) {
        return res.redirect("/loggedin");
    }
    if (username && password) {
        connection.query(
            "SELECT * FROM accounts WHERE username = ?",
            [username],
            function (error, results) {
                if (error) {
                    console.error("Database query error:", error);
                    res.send("Error occurred while logging in.");
                    return;
                }

                if (results.length > 0) {
                    const hashedpassword = results[0].password;

                    bcrypt.compare(password, hashedpassword, (err, isMatch) => {
                        if (err) {
                            console.error("Error comparing passwords:", err);
                            res.send("Error verifying password.");
                            return;
                        }

                        if (isMatch) {
                            req.session.isLoggedIn = true;
                            req.session.username = username;
                            console.log("Login successful!");
                            res.redirect("/loggedin");
                        } else {
                            res.send("Incorrect Username and/or Password");
                        }
                    });
                } else {
                    res.send("Incorrect Username and/or Password");
                }

            }
        )
    } else {
        res.send("please enter username/password");
        res.end();
    }

});

function checkLogin(req, res, next) {
    if (req.session.isLoggedIn) {
        console.log("logged in")
        return next(); // Proceed to the next middleware/route handler

    } else {
        console.log("not logged in")
        return res.redirect("/login.html?loginRequired=true");
    }

}

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname + "/public/register.html"));
});

app.post('/signup', (req, res) => {

    console.log(req.body)
    var username = req.body.username;
    var password = req.body.password;
    var email = req.body.email;
    var sex = req.body.sex;
    var fullname = req.body.fullname;
    var phone = req.body.phone;

    const day = req.body.day
    const month = req.body.month
    const year = req.body.year
    const birthdate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`

    console.log("signup is working...")

    bcrypt.hash(password, 10, (err, hashedpassword) => {
        if (err) {
            console.log("Error hashing password", err);
            return res.status(500).send("Error hashing password");
        }

        const post = {
            username: username,
            password: hashedpassword,
            email: email,
            sex: sex,
            fullname: fullname,
            phone: phone,
            birthdate: birthdate

        };

        console.log(post)

        connection.query("INSERT INTO accounts SET ?", post, (err) => {
            if (err) {
                console.error("Error inserting data:", err);
                return res.status(500).send("Error saving user data.");
            }
            console.log("Data Inserted");
            res.send(`
                        <script>
                            alert("You're registered!");
                            window.location.href = "/login";
                        </script>
                    `);
        });
    })

});

app.get('/forgot', function (req, res) {
    res.sendFile(path.join(__dirname + "/public/forgot.html"))
})

app.post('/forgot', function (req, res) {
    console.log('+++forgot section here+++')
    const username = req.body.username;
    console.log('Checking username...')

    connection.query(
        "SELECT * FROM accounts WHERE username = ?", username,
        function (err, rowM) {
            if (err) { console.error(); }

            if (rowM.length > 0) {
                let randomPass = Math.random().toString(36).substring(2, 10);

                var emails = rowM[0].email;
                var usernames = rowM[0].username;
                var subject = "Reset your password";

                req.session.resetEmail = emails;
                req.session.resetUsername = username;
                req.session.tempPassword = randomPass;


                var html = "Hello " + rowM[0].username + ",<br><br>" +
                    "&nbsp;&nbsp;There was recently a request to change the password for your account.<br>" +
                    "Your new password is&nbsp;" + randomPass + "<br>" +
                    "Use this password to login to our website" + "<br><br><br>Thank you,<br>The Cybercrime Team";
                sendmail(emails, subject, html);

                console.log("forgot section:", emails);

                bcrypt.genSalt(10, function (err, salt) {
                    bcrypt.hash(randomPass, salt, function (err, hash) {
                        connection.query(
                            "UPDATE accounts SET password = ? WHERE username = ?", [hash, username],

                            function (err) {
                                if (err) { console.error(); }

                                console.log("sending email...")
                                console.log(usernames)
                                // res.send(`<script>alert("Password reset email sent successfully."); window.location.href = "/forgot";</script>`);
                                res.json({
                                    success: true,
                                    message: "Password reset email sent successfully.",
                                    email: emails,
                                    username: usernames,
                                    tempPassword: randomPass
                                })
                                // res.render('reset-password', { email: emails });

                            }
                        );
                    });
                });
            } else {
                res.json({ success: false, message: "User not found. You must register first." });
            }
        }
    )
});

app.get('/verify-temp-password', (req, res) => {
    res.sendFile(path.join(__dirname, '/public/newpass.html'))
});

app.post('/verify-temp-password', (req, res) => {
    console.log('-----------verify-password section-------')
    console.log("req.body:", req.body.tempPassword)
    console.log("req session", req.session.resetUsername)

    var username = req.session.resetUsername
    var password = req.body.tempPassword

    if (username && password) {
        connection.query(
            "SELECT * FROM accounts WHERE username = ?",
            [username],
            function (err, results) {
                if (err) {
                    console.error("Database query error:", error)
                }

                if (results.length > 0) {
                    const hashedpassword = results[0].password;

                    bcrypt.compare(password, hashedpassword, (err, isMatch) => {
                        if (err) {
                            console.log("Error comparing passwords:", err)
                        }

                        if (isMatch) {
                            return res.json({ success: true, message: "Password verified." });
                        }
                    })
                }
            }

        )
    }
});


app.post('/check-username'), function (req, res) {
    const username = req.body.username;
    console.log('Checking username...')

    const query = 'SELECT * FROM accounts WHERE username = ?';
    connection.query(query, [username], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (results.length > 0) {
            res.json({ exists: true }); // Username exists
        } else {
            res.json({ exists: false }); // Username does not exist
        }
    });
}

function sendmail(toemail, subject, html) {
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com', //
        service: 'gmail',
        auth: {
            user: 'rhitakane@gmail.com',   // your email
            //pass: 'Sittichai7749!'  // your email password
            pass: 'negssykscgcvlbhu'    // for app password (token)
        }
    });

    // send mail with defined transport object
    let mailOptions = {
        from: '"CYBER CRIME" <dodo@dodo.org>',  // sender address
        to: toemail,    // list of receivers
        subject: subject,   // Subject line
        // text: textMail
        html: html     // html mail body
    };

    // send mail with defined transport object
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log(error);
            res.send('Error, unabel to send email. please Try again');
        }
        else {
            // console.log('INFO EMAIL:', info);
            console.log("send email successful");
        }
    });
}

app.get('/newpass', function (req, res) {
    res.sendFile(path.join(__dirname, '/public/newpass.html'))
})

app.post('/newpass', async function (req, res) {
    const updatedPassword = req.body.newpass
    var username = req.session.resetUsername

    console.log("-----update password section-----")
    console.log("username:", username)
    console.log("new password:", updatedPassword)

    try {
        // Hash the password asynchronously
        const hashedPassword = await bcrypt.hash(updatedPassword, 10);

        console.log("Hashed password:", hashedPassword);

        connection.query(
            "UPDATE accounts SET password = ? WHERE username = ?",
            [hashedPassword, username],
            (err, result) => {
                if (err) {
                    console.error("Error updating password:", err);
                    return res.status(500).send("Error updating password.");
                }

                console.log("Update result:", result);
                console.log("Affected rows:", result.affectedRows);

                if (result.affectedRows === 1) {
                    console.log("Password has been updated!");
                    req.session.username = username;  // Corrected usage of session
                    req.session.isLoggedIn = true;   // Corrected usage of session
                    res.send(`
                        <script>
                            alert("Password has been updated!");
                            window.location.href = "/loggedin";
                        </script>
                    `);
                } else {
                    res.status(400).send("No matching user found or no changes made.");
                }
            }
        );
    } catch (err) {
        console.error("Error hashing password:", err);
        res.status(500).send("Error processing password update.");
    }

})


app.get("/home", checkLogin, function (req, res) {
    res.sendFile(path.join(__dirname, "/public/index.html"), (err) => {
        if (err) {
            res.status(err.status).end();
        }
    });
});


app.get("/news", checkLogin, function (req, res) {
    res.sendFile(path.join(__dirname, "/public/news.html"), (err) => {
        if (err) {
            res.status(err.status).end();
        }
    });
});

app.get("/contact", checkLogin, function (req, res) {
    res.sendFile(path.join(__dirname, "/public/news.html"), (err) => {
        if (err) {
            res.status(err.status).end();
        }
    });
});

app.get("/about", checkLogin, function (req, res) {
    res.sendFile(path.join(__dirname, "/public/about.html"), (err) => {
        if (err) {
            res.status(err.status).end();
        }
    });
});

app.get("/loggedin", checkLogin, function (req, res) {
    if (req.session.isLoggedIn && req.session.isLoggedIn === true) {
        const username = req.session.username; // Get the username from session
        res.sendFile(path.join(__dirname, "/public/index.html"), (err) => {
            if (err) {
                res.status(err.status).end();
            }
        });
        // Optionally log the username for debugging
        console.log("User logged in: ", username);
    } else {
        res.redirect("/login");
    }
});

app.get("/api/username", (req, res) => {
    if (req.session.isLoggedIn) {
        res.json({ username: req.session.username });
    } else {
        res.status(401).json({ error: "Unauthorized" });
    }
});

app.get('/api/email', (req, res) => {
    if (req.session && req.session.resetEmail) {
        res.json({ email: req.session.resetEmail });
    } else {
        res.status(401).send('Unauthorized');
    }
})

app.get("/Login/status", (req, res) => {
    if (req.session.isLoggedIn) {
        res.json({ status: true });
    } else {
        res.json({ status: false });
    }
})

app.get('/logout', function (req, res) {
    req.session.destroy(); // Destroy session on logout
    console.log("Logged Out")
    res.sendFile(path.join(__dirname, "/public/index.html"));
});



app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
