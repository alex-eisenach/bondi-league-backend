const MongoClient = require("mongodb").MongoClient;
const Express = require("express");
const cors = require('cors');
require('dotenv').config();
const stats = require('./utils/stats');

let app = Express();
app.use(Express.json()); // this was extremely necessary
app.use(cors());

let database;
const client = new MongoClient(process.env.URI, {
    tls: true,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 10000
});

const PORT = process.env.PORT || 5038;

async function startServer() {
    try {
        await client.connect();
        database = client.db(process.env.DATABASENAME);
        console.log('Connected to MongoDB successfully');

        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    } catch (err) {
        console.error('Failed to connect to MongoDB or start server:', err);
        process.exit(1);
    }
}

startServer();

app.get('/gets/metadata', async function (request, response) {
    let col = await database.collection(process.env.COLLECTION);
    let allData = await col.find({}).toArray();

    let allWeeks = new Set();
    let allYears = new Set();
    let allNames = [];
    let yearsToWeeks = {};

    const reDate = /(\d{4}) \w{2} (\d+)/;

    for (const golfer of allData) {
        allNames.push(golfer['Names']);
        for (const key of Object.keys(golfer)) {
            const match = reDate.exec(key);
            if (match) {
                const yr = match[1];
                const wk = match[2];
                allYears.add(yr);
                allWeeks.add(wk);
                if (!yearsToWeeks[yr]) {
                    yearsToWeeks[yr] = new Set();
                }
                yearsToWeeks[yr].add(wk);
            }
        }
    }

    // Convert sets to sorted arrays
    const sortedYears = [...allYears].sort((a, b) => b - a);
    const sortedWeeks = [...allWeeks].sort((a, b) => parseInt(a) - parseInt(b));
    for (const yr of Object.keys(yearsToWeeks)) {
        yearsToWeeks[yr] = [...yearsToWeeks[yr]].sort((a, b) => parseInt(a) - parseInt(b));
    }

    // Determine latest year and week
    const latestYear = sortedYears[0];
    const latestWeek = yearsToWeeks[latestYear] ? yearsToWeeks[latestYear].slice(-1)[0] : '';

    response.json({
        names: allNames.sort(),
        years: sortedYears,
        weeks: sortedWeeks,
        yearsToWeeks,
        latestYear,
        latestWeek
    });
});

app.get('/gets/allData', async function (request, response) {
    let col = await database.collection(process.env.COLLECTION);
    let allData = await col.find({}).toArray();
    response.json(allData);
});

app.get('/gets/stats/:golfer', async function (request, response) {
    const golferName = request.params.golfer;
    const { startYear, startWeek, endYear, endWeek } = request.query;

    let col = await database.collection(process.env.COLLECTION);
    let golfer = await col.findOne({ 'Names': golferName });

    if (!golfer) {
        return response.status(404).json({ error: 'Golfer not found' });
    }

    let scores = [];
    let dates = [];
    let xValues = [];
    const reDate = /(\d{4}) \w{2} (\d+)/;

    // Sort keys to ensure chronological order for trend/handicap
    const sortedKeys = Object.keys(golfer).filter(k => reDate.test(k)).sort((a, b) => {
        const ma = reDate.exec(a);
        const mb = reDate.exec(b);
        const va = parseInt(ma[1]) * 100 + parseInt(ma[2]);
        const vb = parseInt(mb[1]) * 100 + parseInt(mb[2]);
        return va - vb;
    });

    for (const key of sortedKeys) {
        const match = reDate.exec(key);
        if (match) {
            const [_, yrStr, wkStr] = match;
            const yr = parseInt(yrStr);
            const wk = parseInt(wkStr);

            const currentVal = yr * 100 + wk;
            const startVal = (startYear && startWeek) ? (parseInt(startYear) * 100 + parseInt(startWeek)) : null;
            const endVal = (endYear && endWeek) ? (parseInt(endYear) * 100 + parseInt(endWeek)) : null;

            if (startVal && currentVal < startVal) continue;
            if (endVal && currentVal > endVal) continue;

            const score = golfer[key];
            if (score !== null && score !== undefined && score !== '') {
                scores.push(parseInt(score));
                dates.push(key);
                xValues.push(currentVal);
            }
        }
    }

    if (scores.length === 0) {
        return response.json({
            handicap: 0,
            avgScore: 0,
            trend: [0, 0],
            scores: [],
            dates: [],
            xValues: []
        });
    }

    const handicap = stats.handicap(scores);
    const avgScore = stats.avgScore(scores);
    const trendResult = stats.trend(scores);

    response.json({
        handicap,
        avgScore,
        trend: trendResult,
        scores,
        dates,
        xValues
    });
});

app.get('/gets/leagueStats/:year/:week', async function (request, response) {
    const { year, week } = request.params;
    let col = await database.collection(process.env.COLLECTION);
    let allData = await col.find({}).toArray();

    const stringForDate = (y, w) => {
        const wkStr = (['2017', '2018', '2019', '2020'].includes(y)) ? 'WK' : 'Wk';
        return `${y} ${wkStr} ${w}`;
    };

    const reDate = /(\d{4}) \w{2} (\d+)/;
    const parseDateString = (str) => {
        const regEx = reDate.exec(str);
        return regEx ? regEx : null;
    };

    let result = {};
    let scoresList = [];

    const targetDateStr = stringForDate(year, week);

    for (const obj of allData) {
        let handicapScores = [];
        let grossScore = null;
        const golferName = obj['Names'];

        // Sort keys to ensure chronological order for handicap calculation
        const keys = Object.keys(obj).sort();

        for (const key of keys) {
            if (key === targetDateStr) {
                if (obj[key] !== '' && obj[key] !== null) {
                    grossScore = parseInt(obj[key]);
                }
            } else {
                const match = parseDateString(key);
                if (match) {
                    const [_, yr, wk] = match;
                    // Only include scores BEFORE the target date
                    if (yr < year || (yr === year && parseInt(wk) < parseInt(week))) {
                        if (obj[key] !== '' && obj[key] !== null) {
                            handicapScores.push(parseInt(obj[key]));
                        }
                    }
                }
            }
        }

        const hcap = stats.handicap(handicapScores);
        if (grossScore !== null) {
            scoresList.push({
                name: golferName,
                handicap: hcap,
                gross: grossScore,
                net: grossScore - hcap
            });
        }
    }

    // Flight logic
    scoresList.sort((a, b) => a.handicap - b.handicap);
    const midpoint = Math.ceil(scoresList.length / 2);

    for (let i = 0; i < scoresList.length; i++) {
        const s = scoresList[i];
        result[s.name] = {
            flight: (i < midpoint) ? 'A' : 'B',
            gross: s.gross,
            net: s.net,
            handicap: s.handicap
        };
    }

    // Summary calculations
    let aWinner = { name: '?', net: Infinity };
    let bWinner = { name: '?', net: Infinity };
    let totalGross = 0;
    let lowNet = { name: '?', net: Infinity };

    for (const [name, obj] of Object.entries(result)) {
        totalGross += obj.gross;
        if (obj.flight === 'A' && obj.net < aWinner.net) {
            aWinner = { name, net: obj.net };
        }
        if (obj.flight === 'B' && obj.net < bWinner.net) {
            bWinner = { name, net: obj.net };
        }
        if (obj.net < lowNet.net) {
            lowNet = { name, net: obj.net };
        }
    }

    const summary = {
        aWinner: aWinner.name,
        bWinner: bWinner.name,
        meanScore: scoresList.length > 0 ? (totalGross / scoresList.length).toFixed(1) : '?',
        lowNet: lowNet.name !== '?' ? `${lowNet.name} (${lowNet.net.toFixed(2)})` : '?'
    };

    response.json({
        flightMap: result,
        summary: summary
    });
});

app.post('/posts/newWeek', async function (request, response) {

    console.log('Received newWeek post request');
    console.log(request.body);

    let col = await database.collection(process.env.COLLECTION);

    let result = await
        col.updateMany({},
            [{
                '$set': request.body
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
    const name = request.body.name;

    let col = await database.collection(process.env.COLLECTION);
    let result = await
        col.updateOne(
            { 'Names': name },
            {
                $set: {
                    [_date]: score
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
                '$unset': request.body.key
            }]
        );

    response.send(result).status(204);
    console.log(result);
});
