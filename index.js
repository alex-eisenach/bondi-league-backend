const MongoClient = require("mongodb").MongoClient;
const Express     = require("express");
const cors        = require('cors');
require('dotenv').config();

let app = Express();
app.use(Express.json()); // this was extremely necessary
app.use(cors());

let database;

app.listen(5038, ()=> {
    database = new MongoClient(process.env.URI)
        .db(process.env.DATABASENAME);
    console.log('Successful');
});

app.get('/gets/allData', async function (request, response) {
    database
        .collection(process.env.COLLECTION)
        .find({})
        .toArray()
        .then((data) => {
            response.json(data);
        });
});

app.post('/posts/newWeek', async function (request, response) {

    console.log('Received newWeek post request');
    console.log(request.body);

    let col = await database.collection(process.env.COLLECTION);

    let result = await 
        col.updateMany({},
            [{
                '$set' : request.body
            }]
        );

    response.send(result).status(204);
    console.log(result);
});


app.post('/posts/newGolfer', async function (request, response) {

    console.log('Received post request');
    console.log(request.body);

    let col = await database.collection(process.env.COLLECTION);
    let result = await col.insertOne(request.body);

    response.send(result).status(204);
    console.log(result);
});

app.post('/posts/update', async function (request, response) {

    console.log('Received update post request');
    console.log(request.body);

    const score = parseInt(request.body.score);
    const _date = request.body.date;
    const name  = request.body.name;

    let col = await database.collection(process.env.COLLECTION);
    let result = await
    col.updateOne(
        {'Names' : name},
        { 
            $set: {
                [_date] : score
            }
        }
    )

    response.send(result).status(204);
    console.log(result);
});

app.post('/posts/removeWeek', async function (request, response) {

    console.log('Received removeWeek post request');
    console.log(request.body.key);

    let col = await database.collection(process.env.COLLECTION);

    let result = await 
        col.updateMany({},
            [{
                '$unset' : request.body.key
            }]
        );

    response.send(result).status(204);
    console.log(result);
});
