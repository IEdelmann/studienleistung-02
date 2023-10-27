// Import all the modules;
const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const pg = require("pg");
const session = require("express-session");
const path = require("path");
const upload = require("express-fileupload");
const bcrypt = require("bcrypt");

/* Reading global variables from config file */
dotenv.config();
const PORT = process.env.PORT;
const conString = process.env.DB_CON_STRING;

// Set up the connection to the dataBase;
if (conString === undefined) {
    console.log("ERROR: Environment variable DB_CON_STRING not set!");
    process.exit(1);
}

const dbConfig = {
    connectionString: conString,
    ssl: {rejectUnauthorized: false}
}

let dbClient = new pg.Client(dbConfig);
dbClient.connect();

let urlEncodedParser = bodyParser.urlencoded({extended: false});
app = express();

// Active sessions;
app.use(session({
    secret: "Remember, remember... the 5th of November!",
    resave: true,
    saveUninitialized: true
}));

// Turn on serving static files (required for delivering css to client);
app.use('/public', express.static(path.join(__dirname, "public")));
app.use(express.static("public"));

//configure template engine
app.set("views", "views");
app.set("view engine", "pug");

// Default configuration for the file upload;
app.use(upload());

// Configure the 'bcrypt' module;
const saltRounds = 10;

// Define routes;
app.get('/', (req, res) => {
    res.redirect("dashboard");
});

// The 'registration' routes;
app.get("/registration", function (req, res) {
    res.render("registration");
});

app.post("/registration", urlEncodedParser, async function (req, res) {
    let username = req.body.username;
    let birthday = req.body.birthday;
    let password = req.body.password;
    let passwordCheck = req.body.passwordCheck;
    let date = new Date();
    let formattedDate = date.toISOString();

    // Default variables when signing up for OTHer;
    let profile_pic = "default";
    let bio_text = "Hallo, bin neu hier. Komme jetzt öfters.";

    if (username !== "") {       // Make sure that there is a username;

        if (password && passwordCheck !== "") {      // Make sure that a password is given;

            let dbUsersResponse = await dbClient.query(`SELECT * FROM users WHERE name = ($1)`, [username]);

            if (dbUsersResponse.rows.length === 0) {  // Check if the username is already taken;

                if (password === passwordCheck) {    // Check if both iterations are the same;

                    let dbAmountOfRowsResponse = await dbClient.query(`SELECT user_id FROM users`);
                    let nextUserId = dbAmountOfRowsResponse.rows.length + 1;     // A little trick to increment the user_id by 'hand';

                    bcrypt.hash(passwordCheck, saltRounds, function (error, hash) {

                        dbClient.query(`INSERT INTO users (user_id, name, password, birthday, profile_pic, bio_text, created) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [nextUserId, username, hash, birthday, profile_pic, bio_text, formattedDate], function (dbError, dbResponse) {
                            res.render("login", {message: "Sie haben sich erfolgreich registriert!"});
                        });
                    });

                 } else {
                        res.render("registration", {registration_error: "Deine Passwörter stimmen nicht überein!"});
                }

            } else {
                    res.render("registration", {registration_error: "Der Benutzername ist bereits vergeben, bitte wähle einen anderen."});
            }

        } else {
            res.render("registration", {registration_error: "Sie müssen ein Passwort wählen!"});
        }

    } else {
        res.render("registration", {registration_error: "Sie müssen einen Benutzernamen wählen!"});
    }
});

// The 'login' routes;
app.get("/login", function (req, res) {
    res.render("login");
});

app.post("/login", urlEncodedParser, async function (req, res) {
    let username = req.body.username;
    let password = req.body.password;

    // If there *is* at least input, try the login procedure;
    if (username !== "") {
        let dbUsersResponse = await dbClient.query(`SELECT * FROM users WHERE name = ($1)`, [username]);

        if (dbUsersResponse.rows.length === 0) {
            res.render("login", {login_error: "Benutzername und/ oder Passwort falsch!"});

        } else {
            bcrypt.compare(password, dbUsersResponse.rows[0].password, function (error, result) {

                if (result === true) {
                    req.session.userId = dbUsersResponse.rows[0].user_id;     // Creates here the all important cookie;
                    res.redirect("/dashboard");

                } else {
                    res.render("login", {login_error: "Benutzername und/ oder Passwort falsch!"});
                }
            });
        }

    } else {
        res.redirect("/login");
    }
});

app.get("/dashboard", async function (req, res) {

    let dbResponse = await dbClient.query(`SELECT o.post_id, o.user_id, o.text, o.created, u.name, u.profile_pic FROM others o JOIN users u ON u.user_id = o.user_id ORDER BY o.post_id DESC`);

    for (let i = 0; i < dbResponse.rows.length; i++) {
        let formattedDate = new Date(dbResponse.rows[i].created);
        dbResponse.rows[i].created = formattedDate.toLocaleString();
    }

    if (req.session.userId !== undefined) {
        res.render("index", {rows: dbResponse.rows});

    } else {
        res.render("lockedApp", {rows: dbResponse.rows});
    }
});

// The 'myProfile' routes; Only available for logged-in users;
// If one would request this site without the holy cookie, it redirects one to the 'dashboard' page, which checks if one is logged-in and corresponds with a locked navigation bar;
app.get("/myProfile", async function (req, res) {
    if (req.session.userId !== undefined) {

        let dbUsersResponse = await dbClient.query(`SELECT * FROM users WHERE user_id = ($1)`, [req.session.userId]);

        let timeStampCreated = new Date(dbUsersResponse.rows[0].created);
        dbUsersResponse.rows[0].created = timeStampCreated.toLocaleDateString();

        let birthday = new Date(dbUsersResponse.rows[0].birthday);
        dbUsersResponse.rows[0].birthday = birthday.toLocaleDateString();

        // 'ORDER BY *** DESC' => sorts the table so the latest posts are at the top;
        let dbOthersResponse = await dbClient.query(`SELECT * FROM others WHERE user_id = ($1) ORDER BY created DESC`, [req.session.userId]);

        for (let i = 0; i < dbOthersResponse.rows.length; i++) {
            let otherCreated = new Date(dbOthersResponse.rows[i].created);
            dbOthersResponse.rows[i].created = otherCreated.toLocaleString();
        }

        let dbFolloweeResponse = await dbClient.query(`SELECT * FROM follows WHERE followee = ($1)`, [req.session.userId]);
        let dbFollowerResponse = await dbClient.query(`SELECT * FROM follows WHERE follower = ($1)`, [req.session.userId]);
        res.render("myProfile", {user: dbUsersResponse.rows[0], posts: dbOthersResponse.rows, postcount: dbOthersResponse.rows.length, followee: dbFolloweeResponse.rows.length, follower: dbFollowerResponse.rows.length});

    } else {
        res.redirect("/dashboard");
    }
});

// This 'post' route of 'myProfile' handles the upload of new user profile pictures;
app.post("/myProfile", async function (req, res) {

    if (req.session.userId !== undefined) {

        // Checks if there is event something to upload;
        if (!req.files || Object.keys(req.files).length === 0) {
            return res.status(400).send("Error - no file was uploaded!");
        }

        let fileUpload = req.files.file_upload;
        let uploadPath = __dirname + "/public/img/users/" + fileUpload.name;    // Relativ path to the directory on the server holding the user pictures;
        let pureFileName = fileUpload.name.split(".");

        // Actually moves the new picture to the correct directory;
        fileUpload.mv(uploadPath, function (error) {
            if (error) {
                return res.status(500).send(error);
            }

            // Updates the 'profile_pic' in the dataBase;
            dbClient.query(`UPDATE users SET profile_pic = ($1) WHERE user_id = ($2)`, [pureFileName[0], req.session.userId], function (dbError, dbResponse) {

                res.redirect("/myProfile");     // Gets the user back to the 'myProfile' site;
            });
        });

    } else {
        // In case someone tries to access this site without login, it redirects to the event page, showing an error;
        res.render("event", {title: "Kein Zugriff", content_title: "Kein Zugriff auf die Profilseite", error: "Sie müssen angemeldet sein um auf Ihr Profil zugreifen zu können!"});
    }
});

app.post("/updateBio", urlEncodedParser, function (req, res) {
    if (req.session.userId !== undefined) {
        let newBioText = req.body.updateBio;

        dbClient.query(`UPDATE users SET bio_text = ($1) WHERE user_id = ($2)`, [newBioText, req.session.userId], function (dbError, dbInsertResponse) {
            console.log(`Bio text of user ${req.session.userId} was updated!`);
            res.redirect("/myProfile");
        });

    } else {
        res.render("event", {title: "Kein Zugriff", content_title: "Kein Zugriff auf die Profilseitenfunktion", error: "Sie müssen angemeldet sein um auf Ihr Profil aktualisieren zu können!"});
    }
});

app.get("/checkUserProfile/:id", urlEncodedParser, async function (req, res) {
    if (req.session.userId !== undefined) {
        let userId = req.params.id;

            let dbUserResponse = await dbClient.query(`SELECT * FROM users WHERE user_id = ($1)`, [userId]);

            let timeStampCreated = new Date(dbUserResponse.rows[0].created);
            dbUserResponse.rows[0].created = timeStampCreated.toLocaleDateString();

            let dbPostsResponse = await dbClient.query(`SELECT * FROM others WHERE user_id = ($1) ORDER BY created DESC`, [userId]);

            for (let i = 0; i < dbPostsResponse.rows.length; i++) {
                let otherCreated = new Date(dbPostsResponse.rows[i].created);
                dbPostsResponse.rows[i].created = otherCreated.toLocaleString();
            }

            let dbFolloweeResponse = await dbClient.query(`SELECT * FROM follows WHERE followee = ($1)`, [userId]);
            let dbFollowerResponse = await dbClient.query(`SELECT * FROM follows WHERE follower = ($1)`, [userId]);

            res.render("checkUserProfile", {user: dbUserResponse.rows[0], posts: dbPostsResponse.rows, postcount: dbPostsResponse.rows.length, followee: dbFolloweeResponse.rows.length, follower: dbFollowerResponse.rows.length});

    } else {
        res.render("event", {title: "Kein Zugriff", content_title: "Kein Zugriff auf Mitglieder", error: "Sie müssen angemeldet sein um sich Nutzer ansehen zu können!"});
    }
});

// The 'othern' routes;
app.get("/othern", function (req, res) {
   if (req.session.userId !== undefined) {
       res.render("othern");

   } else {
       res.render("event", {title: "Kein Zugriff", content_title: "Kein Zugriff auf das OTHern", error: "Sie müssen angemeldet sein um OTHern zu können!"});
   }
});

// After creating the other, it will be written into the dataBase;
// Then read again to be rendered on the same 'othern' page;
// The .pug page contains conditionals to check whether a new post is given by the key 'just_sent';
app.post("/othern", urlEncodedParser, async function (req, res) {
    let othernInput = req.body.othern_input;
    let currentTime = new Date();

    if (othernInput !== "") {

        if (req.session.userId !== undefined) {

            let dbOtherResponse = await dbClient.query(`SELECT * FROM others`);
            let nextOtherId = dbOtherResponse.rows.length + 1;

            dbClient.query(`INSERT INTO others (post_id, user_id, text, created) VALUES ($1, $2, $3, $4)`, [nextOtherId, req.session.userId, othernInput, currentTime], async function (dbError, dbResponse) {

                let dbUsersResponse = await dbClient.query(`SELECT * FROM users WHERE user_id = ($1)`, [req.session.userId]);
                let dbNewOtherResponse = await dbClient.query(`SELECT * FROM others WHERE post_id = ($1)`, [nextOtherId]);

                res.render("othern", {user: dbUsersResponse.rows[0], just_sent: dbNewOtherResponse.rows[0], date: currentTime.toLocaleString()});
            });
        }

    } else {
        res.render("othern", {othern_error: "Sie müssen etwas in das Feld schreiben um othern zu können!"});
    }
});

// Route to delete ones own others;
app.get("/deleteOther/:id", urlEncodedParser, async function (req, res) {
    if (req.session.userId !== undefined) {
        let otherToDelete = req.params.id;
        let dbCheckUserPostsResponse = await dbClient.query(`SELECT post_id FROM others WHERE user_id = ($1) AND post_id = ($2)`, [req.session.userId, otherToDelete]);

        if (dbCheckUserPostsResponse.rows.length === 0) {
            res.render("event", {error: "Es ist Ihnen nicht erlaubt die OTHers der anderen Nutzer zu löschen!", title: "Zugriff verboten", content_title: "Unerlaubter Zugriff!"});

        } else {
            dbClient.query(`DELETE FROM others WHERE post_id = ($1)`, [otherToDelete], function (dbError, dbResponse) {
                console.log(`Deleted post ${otherToDelete}`);

                // It is *crucial* to update all post_id's after one is deleted because creation of new ones takes the 'length + 1' as the new post_id!
                dbClient.query(`update others o set post_id = sub.rn from (select post_id, row_number () over (order by post_id) as rn from others) sub where o.post_id = sub.post_id`, function (dbError, dbUpdateResponse) {
                    console.log("DataBase post_id's updated");
                });

                res.redirect("/myProfile");
            });
        }

    } else {
        res.render("event", {error: "Sie müssen angemeldet sein um diese Funktion nutzen zu können!", title: "Kein Zugriff", content_title: "Kein Zugriff auf Funktion"});
    }
});

// The 'logout' route;
// Quite simple: if there is a cookie, destroy it and render the event page with a message;
app.get("/logout", function (req, res) {
    if (req.session.userId !== undefined) {

        req.session.destroy(function (error) {
            console.log("The session was destroyed!");
        });

        res.render("event", {message: "Erfolgreich abgemeldet!", title: "Abgemeldet", content_title: "Abmeldung"});

    } else {
        // If someone should, for whatever reason, get to the 'logout' page without even being logged-in in the first place...;
        res.render("event", {error: "Sie waren nie angemeldet!", title: "Abgemeldet", content_title: "Abmeldung"});
    }
});

// The 'users' routes;
app.post("/users", function (req, res) {
    res.redirect("users");
});

app.get("/users", async function (req, res) {
    if (req.session.userId !== undefined) {

        let dbUsersResponse = await dbClient.query(`SELECT * FROM users WHERE user_id != ($1)`, [req.session.userId]);
        let dbFollowsResponse = await dbClient.query(`SELECT user_id, exists (select ($1) FROM follows WHERE follower = ($2) AND followee = users.user_id) FROM users WHERE user_id != ($3)`, [req.session.userId, req.session.userId, req.session.userId]);

        for (let i = 0; i < dbFollowsResponse.rows.length; i++) {
            Object.assign(dbUsersResponse.rows[i], dbFollowsResponse.rows[i]);
        }

        res.render("users", {rows: dbUsersResponse.rows});

    } else {
        res.render("event", {error: "Sie müssen angemeldet sein um auf die anderen Nutzer zugreifen zu können!", title: "Kein Zugriff", content_title: "Kein Zugriff auf andere Nutzer!"});
    }
});

// The 'subscribe/ unsubscribe' routes;
// The pug page of the users have buttons with links containing the various user_id's;
// If the user is currently unsubscribed to another user, it subscribes... and vise versa;
app.get("/subscribeUser/:id", urlEncodedParser, function (req, res) {
    if (req.session.userId !== undefined) {
        let userToSubscribe = req.params.id;

        dbClient.query(`INSERT INTO follows (follower, followee) VALUES ($1, $2)`, [req.session.userId, userToSubscribe], function (dbError, dbResponse) {
            console.log(`Subscribed to ${userToSubscribe}`);
            res.redirect("/users");
        });

    } else {
        res.render("event", {title: "Kein Zugriff", content_title: "Kein Zugriff", error: "Sie müssen angemeldet sein um diese Funktion nutzen zu können!"});
    }
});

app.get("/unsubscribeUser/:id", urlEncodedParser, function (req, res) {
    if (req.session.userId !== undefined) {
        let userToUnsubscribe = req.params.id;

        dbClient.query(`DELETE FROM follows WHERE follower = ($1) AND followee = ($2)`, [req.session.userId, userToUnsubscribe], function (dbError, dbResponse) {
            console.log(`Unsubscribed from ${userToUnsubscribe}`);
            res.redirect("/users");
        });

    } else {
        res.render("event", {title: "Kein Zugriff", content_title: "Kein Zugriff", error: "Sie müssen angemeldet sein um diese Funktion nutzen zu können!"});
    }
});

// Shows only the posts of users subscribed to;
app.get("/subscriptions", async function (req, res) {
    if (req.session.userId !== undefined) {
        let dbFollowsResponse = await dbClient.query(`SELECT user_id, exists (select ($1) FROM follows WHERE follower = ($2) AND followee = users.user_id) FROM users WHERE user_id != ($3)`, [req.session.userId, req.session.userId, req.session.userId]);
        let dbJoinResponse = await dbClient.query(`SELECT u.name, o.post_id, o.user_id, o.text, o.created, u.profile_pic FROM others o JOIN users u ON u.user_id = o.user_id ORDER BY o.created desc`);

        let subscribedPosts = [];

        for (let i = 0; i < dbJoinResponse.rows.length; i++) {
            for (let k = 0; k < dbFollowsResponse.rows.length; k++) {
                if (dbJoinResponse.rows[i].user_id === dbFollowsResponse.rows[k].user_id && dbFollowsResponse.rows[k].exists) {
                    subscribedPosts.push(dbJoinResponse.rows[i]);
                    break;
                }
            }
        }

        if (subscribedPosts.length === 0) {
            res.render("subscriptions", {error: "Entweder haben deine Abonnenten haben bisher nichts geOTHert oder du hast noch keine Abonnenten..."});

        } else {
            for (let i = 0; i < subscribedPosts.length; i++) {
                let tempDate = new Date(subscribedPosts[i].created);
                subscribedPosts[i].created = tempDate.toLocaleString();
            }

            res.render("subscriptions", {rows: subscribedPosts});
        }

    } else {
        res.render("event", {title: "Kein Zugriff", content_title: "Kein Zugriff", error: "Sie müssen angemeldet sein um Ihre Abonnenten sehen zu können!"});
    }
});

// The 'search' routes;
// As the search function must be usable no matter if logged-in or not, it renders a different version of search results;
app.get("/search", function (req, res) {
    if (req.session.userId !== undefined) {
        res.render("searchLoggedIn")

    } else {
        res.render("searchNoSession");
    }
});

app.post("/search", urlEncodedParser, async function (req, res) {
    let searchInput = req.body.search_field;

    if (req.session.userId !== undefined) {

        // If logged-in, it searches for everything *LIKE* the input but one self's;
        // This is important as the search results have to have the 'subscribe/ unsubscribe' buttons;
        let dbSearchResponse = await dbClient.query(`SELECT * FROM users WHERE name LIKE ($1) AND user_id != ($2)`, [`%${searchInput}%`, req.session.userId]);

        if (dbSearchResponse.rows.length !== 0) {

            let dbFollowsResponse= await dbClient.query(`SELECT user_id, exists (select ($1) FROM follows WHERE follower = ($2) AND followee = users.user_id) FROM users WHERE user_id != ($3)`, [req.session.userId, req.session.userId, req.session.userId]);
            let matches = [];

            // After getting the results from the dataBase, it has to iterate though them to look as the 'follows' query returns a lot of rows;
            // If the user_id in the search results match one of the user_id in the 'follows' query, it pushes this row into a temporary array called 'matches';
            for (let a = 0; a < dbSearchResponse.rows.length; a++) {

                for (let b = 0; b < dbFollowsResponse.rows.length; b++) {

                    if (dbSearchResponse.rows[a].user_id === dbFollowsResponse.rows[b].user_id) {
                        matches.push(dbFollowsResponse.rows[b]);
                        break;
                    }
                }
            }

            // Afterwards the rows in 'matches' will be written into the search result rows;
            for (let i = 0; i < dbSearchResponse.rows.length; i++) {
                Object.assign(dbSearchResponse.rows[i], matches[i]);
            }

            // Render the results in the 'logged-in' page with the additional key 'session';
            res.render("searchLoggedIn", {searchInput: searchInput, session: req.session.userId, rows: dbSearchResponse.rows});

        } else {
            // If nothing is found with the search input, it renders once again the 'logged-in' page, but this time with an 'error' key;
            res.render("searchLoggedIn", {error: "No search results", searchInput: searchInput, session: req.session.userId});
        }

    } else {
        // This search function is quite similar to the one above, but only searches for the input without all the additional information for the 'subscription' mechanic;'
        // Only available if not 'logged-in';
        let dbSearchResponse= await dbClient.query(`SELECT * FROM users WHERE name LIKE ($1)`, [`%${searchInput}%`]);

        if (dbSearchResponse.rows.length !== 0) {
            res.render("searchNoSession", {searchInput: searchInput, rows: dbSearchResponse.rows});

        } else {
            res.render("searchNoSession", {error: "No search results", searchInput: searchInput});
        }
    }
});

// The routes for the subscription buttons in conjunction with the search function - only available when 'logged-in';
app.get("/subscribeUserSearch/:id", urlEncodedParser, function (req, res) {
    if (req.session.userId !== undefined) {
        let userToSubscribe = req.params.id;

        dbClient.query(`INSERT INTO follows (follower, followee) VALUES ($1, $2)`, [req.session.userId, userToSubscribe], function (dbError, dbResponse) {
            console.log(`Subscribed to ${userToSubscribe}`);
            res.render("searchLoggedIn", {subscribtion: "Subscribed"});
        });

    } else {
        res.render("event", {title: "Kein Zugriff", content_title: "Kein Zugriff", error: "Sie müssen angemeldet sein um diese Funktion nutzen zu können!"});
    }
});

app.get("/unsubscribeUserSearch/:id", urlEncodedParser, function (req, res) {
    if (req.session.userId !== undefined) {
        let userToUnsubscribe = req.params.id;

        dbClient.query(`DELETE FROM follows WHERE follower = ($1) AND followee = ($2)`, [req.session.userId, userToUnsubscribe], function (dbError, dbResponse) {
            console.log(`Unsubscribed from ${userToUnsubscribe}`);
            res.render("searchLoggedIn", {unsubscribtion: "Unsubscribed"});
        });

    } else {
        res.render("event", {title: "Kein Zugriff", content_title: "Kein Zugriff", error: "Sie müssen angemeldet sein um diese Funktion nutzen zu können!"});
    }
});

// Route for starting the server;
app.listen(PORT, function() {
  console.log(`OTHer running and listening on port ${PORT}`);
});