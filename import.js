const fs = require("fs");
const csvParser = require("csv-parse");
const dotenv = require("dotenv");
const pg = require("pg");
const bcrypt = require("bcrypt");

dotenv.config();
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

// Set up the bcrypt module;
const saltRounds = 10;

// Write 'users.csv' into the dataBase 'users' if it is not already in there;
dbClient.query(`SELECT * FROM users`, function (dbError, dbResponse) {
    if (dbResponse.rows.length === 0) {

        const processFile = async () => {
            const parser = fs
                .createReadStream("users.csv")
                .pipe(csvParser.parse());
            for await (const record of parser) {

                bcrypt.hash(record[2], saltRounds, function (error, hash) {

                    dbClient.query(`INSERT INTO users (user_id, name, password, birthday, profile_pic, bio_text, created) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [record[0], record[1], hash, record[3], record[4], record[5], record[6]], function (dbError, dbResponse) {
                    });
                });
            }
        };

        console.log("users.csv written into the database 'users';");

        (async () => {
            await processFile();
        })();

    } else {
        console.log("Database 'users' already contains data! Nothing written into the database!");
    }
});

// Write 'others.csv' into the dataBase 'others_p' if it is not already in there;
dbClient.query(`SELECT * FROM others`, function (dbError, dbResponse) {
    if (dbResponse.rows.length === 0) {

        const processFile = async () => {
            const parser = fs
                .createReadStream("others.csv")
                .pipe(csvParser.parse());
            for await (const record of parser) {

                dbClient.query(`INSERT INTO others (post_id, user_id, text, created) VALUES ($1, $2, $3, $4)`, [record[0], record[1], record[2], record[3]], function (dbError, dbResponse) {
                });
            }
        };

        console.log("others.csv written into the database 'others';");

        (async () => {
            await processFile();
        })();

        exitImport();
    } else {
        console.log("Database 'others' already contains data! Nothing written into the database!");
        exitImport();
    }
});

function exitImport() {
    console.log("Import script completed!");
}