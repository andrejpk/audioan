declare module "goertzeljs" {
  export interface goptions {
    sampleRate?: number;
    frequencies?: number[];
  }
  export default class Goertzel {
    constructor(options: goptions);
    processSample(sample: number): void;
    energies: Record<string, number>;
    refresh();
  }
}
