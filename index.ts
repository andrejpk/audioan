import {DFT} from '@rkesters/dsp.ts';
import {Reader} from 'wav';
import * as fs from 'fs';
import Goertzel from 'goertzeljs';
import {createCanvas, loadImage} from 'canvas';

console.log(`loading file`);
const file = fs.createReadStream('./srs430.wav');
const reader = new Reader({});

const frequencies = [580, 490];

const detectionPeriod = 0.05; // seconds

reader.on('format', (format) => {
  console.log(`format: ${JSON.stringify(format)}`);
  if (format.bitDepth !== 16) {
    throw new Error(`only 16-bit depth supported`);
  }

  // frequencies we are analyzing
  const gz = new Goertzel({
    frequencies,
    sampleRate: format.sampleRate,
  });

  // collector for gz results
  const freqValues = frequencies.reduce((p, c) => {
    p.set(c.toString(), []);
    return p;
  }, new Map<string, number[]>());

  const buffers = Array.from({length: format.channels}, (x, i) => i).map(
    (ch) => [] as number[]
  );
  let numSamples = 0;
  let gzSamples = 0;
  let sampleMag = 0;
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
              for (let f of freqValues.keys()) {
                const freqData = freqValues.get(f);
                const thisEnergy = gz.energies[f.toString()];
                // console.log(`f: ${f}: ${thisEnergy} data: ${freqData && freqData.length}`);
                if (freqData) freqData.push(thisEnergy);
              }
              // if (gz.energies['590'] > 0.09) {
              //   console.log(
              //     `s: ${numSamples} t: ${(
              //       numSamples / format.sampleRate
              //     ).toFixed(2)} mag: ${(sampleMag / numSamples).toFixed(
              //       2
              //     )} e: ${JSON.stringify(gz.energies)}`
              //   );
              // }
              gzSamples = 0;
              gz.refresh();
              sampleMag = 0;
            }
          }
        }
      }
    }
    const energies = gz.energies;
  });

  reader.on('end', () => {
    console.log(`end`);
    renderBufferToImage(
      buffers,
      freqValues,
      0.05,
      format.sampleRate,
      800,
      'sampleout.png'
    );
  });
});

async function renderBufferToImage(
  buffers: number[][],
  freqValues: Map<string, number[]>,
  secondsPerYPixel: number,
  sampleRate: number,
  height: number,
  filename: string
) {
  // create canvas
  const imageWidth = Math.floor(
    buffers[0].length / sampleRate / secondsPerYPixel
  );
  const canvas = createCanvas(imageWidth, height);
  console.log(`Image size ${imageWidth}x${height}`);
  const ctx = canvas.getContext('2d');

  // black blackground
  ctx.beginPath();
  ctx.rect(0, 0, imageWidth, height);
  ctx.fillStyle = 'black';
  ctx.fill();

  // define charting methods
  const minSampleValue = -32768;
  const maxSampleValue = 32768;
  const renderAmplitudeChart = (
    buffer: number[],
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
    minValue: number,
    maxValue: number
  ) => {
    const chartAccum = {count: 0, absSum: 0, min: 0, max: 0, currentX: 0};
    const samplesPerXPixel = buffer.length / width;
    console.log(`samplesPerXPixel ${samplesPerXPixel}`);
    const scaleToY = (sampleValue: number) =>
      height - ((sampleValue - minValue) / (maxValue - minValue)) * height;
    for (let offset = 0; offset < buffer.length; offset++) {
      const v = buffer[offset];
      chartAccum.absSum += Math.abs(v);
      chartAccum.min = Math.min(chartAccum.min, v);
      chartAccum.max = Math.max(chartAccum.max, v);
      chartAccum.count++;
      if (chartAccum.count >= samplesPerXPixel) {
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(x + chartAccum.currentX, y + scaleToY(chartAccum.min));
        ctx.lineTo(x + chartAccum.currentX, y + scaleToY(chartAccum.max));
        ctx.stroke();
        chartAccum.currentX++;
        chartAccum.absSum = 0;
        chartAccum.max = 0;
        chartAccum.min = 0;
        chartAccum.count = 0;
      }
    }
  };

  // draw charts
  const chHeight = height / (buffers.length + freqValues.size);
  let curX = 0;
  // channel charts
  for (let ch = 0; ch < buffers.length; ch++) {
    renderAmplitudeChart(
      buffers[ch],
      0,
      curX,
      imageWidth,
      chHeight,
      'rgba(255, 241, 147, 1)',
      minSampleValue,
      maxSampleValue
    );
    curX += chHeight;
  }
  // freq detection charts
  for (const freqKey of freqValues.keys()) {
    // console.log(`freq key ${freqKey}`);
    const thisData = freqValues.get(freqKey);
    if (thisData) {
      console.log(`thisData: ${thisData.length}`);
      renderAmplitudeChart(
        thisData,
        0,
        curX,
        imageWidth,
        chHeight,
        'rgba(255, 241, 147, 1)',
        0,
        0.5
      );
      curX += chHeight;
    }
  }

  // save charts to PNG file
  const out = fs.createWriteStream(filename);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  out.on('finish', () => console.log(`PNG file ${filename} created`));
}

file.pipe(reader);
