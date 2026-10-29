const {Client} = require('pg')

const client = new Client({
    host: process.env.host,
    user: process.env.user,
    port: process.env.port,
    password: process.env.password,
    database: process.env.database
})  

client.connect();

//Sample query to verify connection
client.query("SELECT * FROM NearMatches", (err, res) =>{
    if(!err){
        console.log(res.rows);
    } else {
        console.error(err.message);
    }
    client.end;
})