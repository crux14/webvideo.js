import { LogLevel } from './logger';

export type WVSharedState = {
  videoUrl: string;
  loglevel: LogLevel;
  playState: WVPlayState;
  videoBufferFull: WVSharedFlag;
  audioBufferFull: WVSharedFlag;
  videoDecoderShouldBeDead: WVSharedFlag;
  audioDecoderShouldBeDead: WVSharedFlag;
};

type SerializableWVSharedState = {
  videoUrl: string;
  loglevel: LogLevel;
  playState: Int32Array;
  videoBufferFull: Int32Array;
  audioBufferFull: Int32Array;
  videoDecoderShouldBeDead: Int32Array;
  audioDecoderShouldBeDead: Int32Array;
};

export function serializeWVSharedState(shared: WVSharedState): SerializableWVSharedState {
  return {
    videoUrl: shared.videoUrl,
    loglevel: shared.loglevel,
    playState: shared.playState.buf(),
    videoBufferFull: shared.videoBufferFull.buf(),
    audioBufferFull: shared.audioBufferFull.buf(),
    videoDecoderShouldBeDead: shared.videoDecoderShouldBeDead.buf(),
    audioDecoderShouldBeDead: shared.audioDecoderShouldBeDead.buf(),
  };
}

export function deserializeWVSharedState(shared: SerializableWVSharedState): WVSharedState {
  return {
    videoUrl: shared.videoUrl,
    loglevel: shared.loglevel,
    playState: WVPlayState.fromBuffer(shared.playState),
    videoBufferFull: WVSharedFlag.fromBuffer(shared.videoBufferFull),
    audioBufferFull: WVSharedFlag.fromBuffer(shared.audioBufferFull),
    videoDecoderShouldBeDead: WVSharedFlag.fromBuffer(shared.videoDecoderShouldBeDead),
    audioDecoderShouldBeDead: WVSharedFlag.fromBuffer(shared.audioDecoderShouldBeDead),
  };
}

export enum WVPlayStateKind {
  STOPPED = -1,
  PLAYING = 0,
  PAUSED,
  BUFFERING,
  SEEKING,
}

export class WVPlayState {
  #buf: Int32Array;

  static fromBuffer(buf: Int32Array): WVPlayState {
    const dummy = WVPlayStateKind.STOPPED;
    const inst = new WVPlayState(dummy);
    inst.#buf = buf;
    return inst;
  }

  constructor(initialValue: WVPlayStateKind) {
    const sab = new SharedArrayBuffer(4);
    this.#buf = new Int32Array(sab);
    this.#buf[0] = initialValue;
  }

  load(): WVPlayStateKind {
    return Atomics.load(this.#buf, 0);
  }

  store(kind: WVPlayStateKind): void {
    Atomics.store(this.#buf, 0, kind);
    Atomics.notify(this.#buf, 0);
  }

  buf(): Int32Array {
    return this.#buf;
  }
}

export class WVSharedFlag {
  #buf: Int32Array;

  static readonly #TRUE: number = 1;
  static readonly #FALSE: number = 0;

  static fromBuffer(buf: Int32Array): WVSharedFlag {
    const dummy = false;
    const inst = new WVSharedFlag(dummy);
    inst.#buf = buf;
    return inst;
  }

  constructor(initialValue: boolean) {
    const sab = new SharedArrayBuffer(4);
    this.#buf = new Int32Array(sab);
    this.#buf[0] = initialValue ? WVSharedFlag.#TRUE : WVSharedFlag.#FALSE;
  }

  load(): boolean {
    return Atomics.load(this.#buf, 0) === WVSharedFlag.#TRUE;
  }

  store(value: boolean): void {
    Atomics.store(this.#buf, 0, value ? WVSharedFlag.#TRUE : WVSharedFlag.#FALSE);
    Atomics.notify(this.#buf, 0);
  }

  buf(): Int32Array {
    return this.#buf;
  }

  sab(): SharedArrayBuffer {
    return this.#buf.buffer as SharedArrayBuffer;
  }
}
