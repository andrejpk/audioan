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
var wav_1 = __importDefault(require("wav"));
var fs = __importStar(require("fs"));
var goertzeljs_1 = __importDefault(require("goertzeljs"));
console.log("loading file");
var file = fs.createReadStream("./srs430.wav");
var reader = new wav_1.default.Reader({});
var detectionPeriod = 0.2; // seconds
reader.on("format", function (format) {
    console.log("format: " + JSON.stringify(format));
    if (format.bitDepth !== 16) {
        throw new Error("only 16-bit depth supported");
    }
    var gz = new goertzeljs_1.default({
        frequencies: [590, 650],
        sampleRate: format.sampleRate,
    });
    var buffers = Array.from({ length: format.channels }, function (x, i) { return i; }).map(function (ch) { return []; });
    var numSamples = 0;
    var gzSamples = 0;
    var sampleMag = 0;
    var samplesPerDetection = format.sampleRate * detectionPeriod;
    reader.on("data", function (chunk) {
        var offset = 0;
        // console.log(`t ${typeof chunk}`);
        while (offset < chunk.length) {
            // for each channel
            for (var ch = 0; ch < format.channels; ch++) {
                // read one sample from one channel
                if (format.bitDepth === 16) {
                    var point = Buffer.from([
                        chunk[offset++],
                        chunk[offset++],
                    ]).readInt16LE();
                    numSamples++;
                    buffers[ch].push(point);
                    if (ch === 1 && numSamples < format.sampleRate * 17) {
                        sampleMag += Math.abs(point);
                        gz.processSample(point);
                        gzSamples++;
                        if (gzSamples >= samplesPerDetection) {
                            //   const toThresh = gz.energies.map()
                            console.log("t: " + (numSamples / format.sampleRate).toFixed(2) + " mag: " + (sampleMag / numSamples).toFixed(2) + " e: " + JSON.stringify(gz.energies));
                            gzSamples = 0;
                            gz.refresh();
                            sampleMag = 0;
                        }
                    }
                }
            }
        }
        // gz.processSample(buffers[0].slice(-1000));
        var energies = gz.energies;
        // console.log(
        //   `Chunk len ${chunk.length} buffLen: ${
        //     buffers[0].length
        //   } energies: ${JSON.stringify(energies)} sample: ${buffers[0].slice(-10)}`
        // );
    });
    reader.on("end", function () {
        console.log("end");
    });
});
file.pipe(reader);
