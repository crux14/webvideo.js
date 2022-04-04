import { logger } from './logger';

export type WVAudioRingBufferInitParams = {
  bufSet: WVAudioRingBufferBufferSet;
  options: Partial<WVAudioRingBufferOptions>;
};

export type WVAudioRingBufferOptions = {
  channels: number;
  bufLength: number;
  thresholdWaitBufLength: number;
};

export type WVAudioRingBufferBufferSet = {
  bufSabs: SharedArrayBuffer[];
  lockSab: SharedArrayBuffer;
  idxSabs: SharedArrayBuffer[];
};

// A ringbuffer for SPSC (single producer, single consumer)
export class WVAudioRingBuffer {
  bufSet: WVAudioRingBufferBufferSet;

  options: WVAudioRingBufferOptions = {
    channels: 2,
    bufLength: 128 * 1000, // NB: the bufLength of SharedArrayBuffer is 4 * 128 * 1000
    thresholdWaitBufLength: -1,
  };

  bufs: Float32Array[] = [];
  lock: Int32Array;

  readIdx: Uint32Array;
  writeIdx: Uint32Array;

  constructor(init: WVAudioRingBufferInitParams) {
    this.bufSet = init.bufSet;
    this.options.channels = init.options.channels ?? this.options.channels;
    this.options.bufLength = init.options.bufLength ?? this.options.bufLength;

    if (this.bufSet.lockSab.byteLength != 4) {
      throw Error('WVAudioRingBuffer Error: ByteLength of WVAudioRingBufferBufferSet.lockSab != 4');
    }
    this.lock = new Int32Array(this.bufSet.lockSab);

    if (this.bufSet.idxSabs.length != 2) {
      throw Error('WVAudioRingBuffer Error: Length of WVAudioRingBufferBufferSet.idxSabs != 2');
    }
    for (let i = 0; i < 2; i++) {
      if (this.bufSet.idxSabs[i].byteLength != 4) {
        throw Error('WVAudioRingBuffer: ByteLength of WVAudioRingBufferBufferSet.idxSabs[] != 4');
      }
    }
    this.readIdx = new Uint32Array(this.bufSet.idxSabs[0]);
    this.writeIdx = new Uint32Array(this.bufSet.idxSabs[1]);

    if (this.bufSet.bufSabs.length != this.options.channels) {
      throw Error(
        'WVAudioRingBuffer Error: Length of WVAudioRingBufferBufferSet.bufSabs != WVAudioRingBufferOptions.channels'
      );
    }
    for (let ch = 0; ch < this.options.channels; ch++) {
      if (this.bufSet.bufSabs[ch].byteLength != 4 * this.options.bufLength) {
        throw Error(
          'WVAudioRingBuffer: ByteLength of WVAudioRingBufferBufferSet.bufSabs[] != WVAudioRingBufferOptions.bufLength'
        );
      }
      this.bufs.push(new Float32Array(this.bufSet.bufSabs[ch]));
    }
  }

  initParams(): WVAudioRingBufferInitParams {
    return {
      bufSet: this.bufSet,
      options: this.options,
    };
  }

  writable(): boolean {
    return Atomics.load(this.lock, 0) === 0;
  }

  private setWritable(writable: boolean): void {
    Atomics.store(this.lock, 0, writable ? 0 : 1);
    Atomics.notify(this.lock, 0);
  }

  waitForWritable(timeout: number = Infinity): void {
    while (!this.writable()) {
      // console.log('...waiting');
      Atomics.wait(this.lock, 0, 1, timeout);
    }
  }

  availableRead(): number {
    const readIdx = Atomics.load(this.readIdx, 0);
    const writeIdx = Atomics.load(this.writeIdx, 0);

    if (writeIdx >= readIdx) {
      return writeIdx - readIdx;
    } else {
      return this.options.bufLength - (readIdx - writeIdx);
    }
  }

  availableWrite(): number {
    return this.options.bufLength - 1 - this.availableRead();
  }

  full(): boolean {
    return this.availableWrite() <= 0;
  }

  nearlyFull(): boolean {
    return (
      this.availableWrite() <
      (this.options.thresholdWaitBufLength > 0
        ? this.options.thresholdWaitBufLength
        : this.options.bufLength * 0.1)
    );
  }

  hungry(): boolean {
    return (
      this.availableWrite() >
      (this.options.thresholdWaitBufLength > 0
        ? this.options.thresholdWaitBufLength
        : this.options.bufLength * 0.05)
    );
  }

  read(rBufs: Float32Array[], rBufLength: number = -1): boolean {
    const readIdx = Atomics.load(this.readIdx, 0);

    if (rBufLength < 0) {
      rBufLength = rBufs[0].length;
    }
    if (rBufLength > this.availableRead()) {
      logger.error('Read out of range', 'WVAudioRingBuffer');
      return false;
    }
    for (let ch = 0; ch < rBufs.length; ch++) {
      for (let i = 0; i < rBufLength; i++) {
        rBufs[ch][i] = this.bufs[ch][(readIdx + i) % this.options.bufLength];
      }
    }

    Atomics.store(this.readIdx, 0, (readIdx + rBufLength) % this.options.bufLength);

    this.setWritable(this.hungry());

    return true;
  }

  write(wBufs: Float32Array[], wBufLength: number = -1): boolean {
    const writeIdx = Atomics.load(this.writeIdx, 0);
    if (wBufLength < 0) {
      wBufLength = wBufs[0].length;
    }

    if (wBufLength > this.availableWrite()) {
      logger.error('Write out of range', 'WVAudioRingBuffer');
      // [TODO] ???
      return false;
    }

    for (let ch = 0; ch < wBufs.length; ++ch) {
      for (let i = 0; i < wBufLength; i++) {
        this.bufs[ch][(writeIdx + i) % this.options.bufLength] = wBufs[ch][i];
      }
    }

    Atomics.store(this.writeIdx, 0, (writeIdx + wBufLength) % this.options.bufLength);

    this.setWritable(!this.nearlyFull());

    return true;
  }
}
