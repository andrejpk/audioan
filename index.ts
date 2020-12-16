import { DFT } from "@rkesters/dsp.ts";
import wav from "wav";
import * as fs from "fs";
import Goertzel from "goertzeljs";

console.log(`loading file`);
const file = fs.createReadStream("./srs430.wav");
const reader = new wav.Reader({});

const detectionPeriod = 0.2; // seconds

reader.on("format", (format) => {
  console.log(`format: ${JSON.stringify(format)}`);
  if (format.bitDepth !== 16) {
    throw new Error(`only 16-bit depth supported`);
  }

  const gz = new Goertzel({
    frequencies: [590, 650],
    sampleRate: format.sampleRate,
  });

  const buffers = Array.from({ length: format.channels }, (x, i) => i).map(
    (ch) => [] as number[]
  );
  let numSamples = 0;
  let gzSamples = 0;
  let sampleMag = 0;
  const samplesPerDetection = format.sampleRate * detectionPeriod;
  reader.on("data", (chunk) => {
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
          numSamples++;
          buffers[ch].push(point);
          if (ch === 1 && numSamples < format.sampleRate * 17) {
            sampleMag += Math.abs(point);
            gz.processSample(point);
            gzSamples++;
            if (gzSamples >= samplesPerDetection) {
              //   const toThresh = gz.energies.map()
              console.log(
                `t: ${(numSamples / format.sampleRate).toFixed(2)} mag: ${(
                  sampleMag / numSamples
                ).toFixed(2)} e: ${JSON.stringify(gz.energies)}`
              );
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

  reader.on("end", () => {
    console.log(`end`);
  });
});

file.pipe(reader);
