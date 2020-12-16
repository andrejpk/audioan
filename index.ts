import {DFT} from '@rkesters/dsp.ts';
import {Reader} from 'wav';
import * as fs from 'fs';
import Goertzel from 'goertzeljs';
import {createCanvas, loadImage} from 'canvas';

console.log(`loading file`);
const file = fs.createReadStream('./srs430.wav');
const reader = new Reader({});

const detectionPeriod = 0.05; // seconds
const chartSecondsPerYPixel = 0.1;
const chartHeight = 200;

reader.on('format', (format) => {
  console.log(`format: ${JSON.stringify(format)}`);
  if (format.bitDepth !== 16) {
    throw new Error(`only 16-bit depth supported`);
  }

  const gz = new Goertzel({
    frequencies: [590, 650],
    sampleRate: format.sampleRate,
  });

  const buffers = Array.from({length: format.channels}, (x, i) => i).map(
    (ch) => [] as number[]
  );
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
                console.log(
                  `s: ${numSamples} t: ${(
                    numSamples / format.sampleRate
                  ).toFixed(2)} mag: ${(sampleMag / numSamples).toFixed(
                    2
                  )} e: ${JSON.stringify(gz.energies)}`
                );
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
    renderBufferToImage(
      buffers[0],
      0.05,
      format.sampleRate,
      200,
      'sampleout.png'
    );
  });
});

async function renderBufferToImage(
  buffer: number[],
  secondsPerYPixel: number,
  sampleRate: number,
  height: number,
  filename: string
) {
  const imageWidth = Math.floor(buffer.length / sampleRate / secondsPerYPixel);
  const canvas = createCanvas(imageWidth, height);
  console.log(`Image size ${imageWidth}x${height}`);
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.rect(0, 0, imageWidth, height);
  ctx.fillStyle = 'black';
  ctx.fill();
  const samplesPerYPixel = chartSecondsPerYPixel * sampleRate;
  const chartAccum = {count: 0, absSum: 0, min: 0, max: 0, currentX: 0};
  const minValue = -32768;
  const maxValue = 32768;
  const scaleToY = (sampleValue: number) =>
    ((sampleValue - minValue) / (maxValue - minValue)) * height;
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
      chartAccum.count = 0;
    }
  }
  const out = fs.createWriteStream(filename);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  out.on('finish', () => console.log(`PNG file ${filename} created`));
}

file.pipe(reader);
