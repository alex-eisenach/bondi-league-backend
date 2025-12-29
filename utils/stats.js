const { mean } = require('mathjs');
const numeric = require('numeric');

const nRounds = 8;  // league convention
const slope = 124;  // Ute Creek from the blue tees
const slopeGlobal = 113;
const slopeUteCreek = slopeGlobal / slope;
const rating = 69.3 / 2.0;  // Course rating from blue tees

const handicap = (scores) => {
    if (scores.length <= 2) {
        return 0.0;
    }
    else if (scores.length <= 8) {
        // if less than 8 scores in record, just use whatever available
        return slopeUteCreek * (mean(scores) - rating);
    }
    else {
        // if > 8 scores in record, pick the best 8 of the last 20
        if (scores.length < 20) {
            const bestEight = [...scores]
                .sort((a, b) => a - b)
                .slice(0, nRounds + 1);
            return slopeUteCreek * (mean(bestEight) - rating);
        } else {
            const bestEight = [...scores]
                .reverse() //assumes the scores are in chronological order
                .slice(0, 21)
                .sort((a, b) => a - b)
                .slice(0, nRounds + 1);
            return slopeUteCreek * (mean(bestEight) - rating);
        }
    }
};

const trend = (scores, N = 0, xData = null) => {
    if (N > 1) {
        const scoresSlice = [...scores].slice(0, N + 1);
        const x = xData ? xData.slice(0, N + 1) : scoresSlice.map((_, i) => i);
        return polyfit(x, scoresSlice, 1);
    } else {
        const x = xData ? xData : scores.map((_, i) => i);
        return polyfit(x, scores, 1);
    }
};

function polyfit(xArray, yArray, order) {
    if (xArray.length <= order) console.warn("Warning: Polyfit may be poorly conditioned.");

    let xMatrix = [];
    let yMatrix = numeric.transpose([yArray]);

    for (let i = 0; i < xArray.length; i++) {
        let temp = [];
        for (let j = 0; j <= order; j++) {
            temp.push(Math.pow(xArray[i], j));
        }
        xMatrix.push(temp);
    }

    let xMatrixT = numeric.transpose(xMatrix);

    let dot1 = numeric.dot(xMatrixT, xMatrix);
    let dot2 = numeric.dot(xMatrixT, yMatrix);

    let dotInv = numeric.inv(dot1);

    let coefficients = numeric.dot(dotInv, dot2);

    return coefficients;
}

const avgScore = (scores) => {
    return mean(scores);
};

module.exports = {
    handicap,
    trend,
    avgScore
};
