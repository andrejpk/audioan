"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const wav_1 = require("wav");
const fs = __importStar(require("fs"));
const goertzeljs_1 = __importDefault(require("goertzeljs"));
const canvas_1 = require("canvas");
console.log(`loading file`);
const file = fs.createReadStream('./srs430.wav');
const reader = new wav_1.Reader({});
const detectionPeriod = 0.05; // seconds
const chartSecondsPerYPixel = 0.1;
const chartHeight = 200;
reader.on('format', (format) => {
    console.log(`format: ${JSON.stringify(format)}`);
    if (format.bitDepth !== 16) {
        throw new Error(`only 16-bit depth supported`);
    }
    const gz = new goertzeljs_1.default({
        frequencies: [590, 650],
        sampleRate: format.sampleRate,
    });
    const buffers = Array.from({ length: format.channels }, (x, i) => i).map((ch) => []);
    let numSamples = 0;
    let gzSamples = 0;
    let sampleMag = 0;
    let chartSampleCount = 0;
    const samplesPerDetection = format.sampleRate * detectionPeriod;
    console.log(`Samples per detection: ${samplesPerDetection}`);
    reader.on('data', (chunk) => {
        let offset = 0;
        // console.log(`t ${typeof chunk}`);
        while (offset < chunk.length) {
            // for each channel
            for (let ch = 0; ch < format.channels; ch++) {
                // read one sample from one channel
                if (format.bitDepth === 16) {
                    const point = Buffer.from([
                        chunk[offset++],
                        chunk[offset++],
                    ]).readInt16LE();
                    // console.log(
                    //   `s: ${numSamples} t: ${(numSamples / format.sampleRate).toFixed(
                    //     2
                    //   )}  ${point}`
                    // );
                    numSamples++;
                    buffers[ch].push(point);
                    if (ch === 1) {
                        //  && numSamples < format.sampleRate * 17) {
                        sampleMag += Math.abs(point);
                        gz.processSample(point);
                        gzSamples++;
                        if (gzSamples >= samplesPerDetection) {
                            //   const toThresh = gz.energies.map()
                            if (gz.energies['590'] > 0.09) {
                                console.log(`s: ${numSamples} t: ${(numSamples / format.sampleRate).toFixed(2)} mag: ${(sampleMag / numSamples).toFixed(2)} e: ${JSON.stringify(gz.energies)}`);
                            }
                            gzSamples = 0;
                            gz.refresh();
                            sampleMag = 0;
                        }
                    }
                }
            }
        }
        // gz.processSample(buffers[0].slice(-1000));
        const energies = gz.energies;
        // console.log(
        //   `Chunk len ${chunk.length} buffLen: ${
        //     buffers[0].length
        //   } energies: ${JSON.stringify(energies)} sample: ${buffers[0].slice(-10)}`
        // );
    });
    reader.on('end', () => {
        console.log(`end`);
        renderBufferToImage(buffers[0], 0.05, format.sampleRate, 200, 'sampleout.png');
    });
});
async function renderBufferToImage(buffer, secondsPerYPixel, sampleRate, height, filename) {
    const imageWidth = Math.floor(buffer.length / sampleRate / secondsPerYPixel);
    const canvas = canvas_1.createCanvas(imageWidth, height);
    console.log(`Image size ${imageWidth}x${height}`);
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.rect(0, 0, imageWidth, height);
    ctx.fillStyle = 'black';
    ctx.fill();
    const samplesPerYPixel = chartSecondsPerYPixel * sampleRate;
    const chartAccum = { count: 0, absSum: 0, min: 0, max: 0, currentX: 0 };
    const minValue = -1000;
    const maxValue = 1000;
    const scaleToY = (sampleValue) => ((sampleValue - minValue) / (maxValue - minValue)) * height;
    for (let offset = 0; offset < buffer.length; offset++) {
        const v = buffer[offset];
        chartAccum.absSum += Math.abs(v);
        chartAccum.min = Math.min(chartAccum.min, v);
        chartAccum.max = Math.max(chartAccum.max, v);
        chartAccum.count++;
        if (chartAccum.count >= samplesPerYPixel) {
            ctx.strokeStyle = 'rgba(255, 241, 147, 1)';
            ctx.beginPath();
            // console.log(
            //   `scaleToMin: ${scaleToY(chartAccum.min)} ... ${scaleToY(
            //     chartAccum.max
            //   )}`
            // );
            ctx.moveTo(chartAccum.currentX, scaleToY(chartAccum.min));
            ctx.lineTo(chartAccum.currentX, scaleToY(chartAccum.max));
            ctx.stroke();
            chartAccum.currentX++;
            chartAccum.absSum = 0;
            chartAccum.max = 0;
            chartAccum.min = 0;
        }
    }
    const out = fs.createWriteStream(filename);
    const stream = canvas.createPNGStream();
    stream.pipe(out);
    out.on('finish', () => console.log(`PNG file ${filename} created`));
}
file.pipe(reader);
