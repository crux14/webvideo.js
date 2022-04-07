import { WVSharedFlag, WVPlayState, WVPlayStateKind } from '../core/state';
import type { WVSharedState } from '../core/state';
import type { WVMediaStreamInfo } from '../media/media';
import { WVVideoDecoderWorkerFront } from './video/decoder';
import { WVAudioDecoderWorkerFront } from './audio/decoder';
import { WVVideoRenderer } from './video/renderer';
import { WVAudioRenderer } from './audio/renderer';
import { logger, LogLevel } from '../core/logger';

export type WVPlayerInitParams = {
  videoUrl: string;
  canvasElem: HTMLCanvasElement;
  loglevel?: LogLevel;
  maxVideoFrameLength?: number;
};

export class WVPlayer {
  /* eslint @typescript-eslint/typedef:0 */
  static readonly LogLevel = LogLevel;

  #initParams: WVPlayerInitParams;
  #shared: WVSharedState;

  #videoRenderer?: WVVideoRenderer;
  #audioRenderer?: WVAudioRenderer;

  #videoDecoder: WVVideoDecoderWorkerFront;

  #maxVideoFrameLength: number = 10;

  #audioDecoder: WVAudioDecoderWorkerFront;

  #videoStream?: WVMediaStreamInfo;
  #audioStream?: WVMediaStreamInfo;

  #isLoadCalled: boolean = false;

  constructor(init: WVPlayerInitParams) {
    this.#initParams = init;
    this.#shared = {
      videoUrl: init.videoUrl,
      loglevel: init.loglevel ?? LogLevel.WARN,
      playState: new WVPlayState(WVPlayStateKind.STOPPED),
      audioBufferFull: new WVSharedFlag(false),
      videoBufferFull: new WVSharedFlag(false),
      videoDecoderShouldBeDead: new WVSharedFlag(false),
      audioDecoderShouldBeDead: new WVSharedFlag(false),
    };
    logger.setLevel(this.#shared.loglevel);

    this.#videoDecoder = new WVVideoDecoderWorkerFront({
      maxVideoFrameLength: this.#maxVideoFrameLength,
    });
    this.#audioDecoder = new WVAudioDecoderWorkerFront();
  }

  async load(cb?: { onStart?: () => Promise<void>; onEnd?: () => Promise<void> }): Promise<void> {
    if (this.#isLoadCalled) {
      throw Error('load() is already called');
    }
    this.#isLoadCalled = true;

    this.#shared.playState.store(WVPlayStateKind.BUFFERING);
    await cb?.onStart?.();
    {
      // decoder init
      this.#videoStream = await this.#videoDecoder.init(this.#shared);
      this.#audioStream = await this.#audioDecoder.init(this.#shared);

      // renderer init
      this.#videoRenderer = new WVVideoRenderer(this.#initParams.canvasElem, this.#videoStream);
      this.#audioRenderer = new WVAudioRenderer(this.#audioStream);
      const port = await this.#audioRenderer.init(this.#shared, this.#audioStream);

      // decoder start
      this.#videoDecoder.start();
      this.#audioDecoder.start(port);

      await new Promise((resolve) => {
        const sharedState = this.#shared;
        requestAnimationFrame(function preloadLoop(): void {
          if (sharedState.playState.load() !== WVPlayStateKind.BUFFERING) {
            return resolve(0);
          }
          if (sharedState.videoBufferFull.load() && sharedState.audioBufferFull.load()) {
            return resolve(0);
          }
          requestAnimationFrame(preloadLoop);
        });
      });

      const frame = this.#videoDecoder.front();
      if (frame) {
        this.#videoRenderer.draw(frame);
      }
    }
    await cb?.onEnd?.();
    this.#shared.playState.store(WVPlayStateKind.PAUSED);
  }

  async unload(cb?: { onStart?: () => Promise<void>; onEnd?: () => Promise<void> }): Promise<void> {
    if (!this.#isLoadCalled) {
      throw Error('load() is not called called');
    }
    this.#isLoadCalled = false;

    this.#shared.playState.store(WVPlayStateKind.STOPPED);
    await cb?.onStart?.();
    {
      this.#videoRenderer?.clear();
      await this.#audioRenderer?.close();

      await this.#videoDecoder.uninit(this.#shared);
      await this.#audioDecoder.uninit(this.#shared);
    }
    await cb?.onEnd?.();
  }

  loadCalled(): boolean {
    return this.#isLoadCalled;
  }

  playState(): WVPlayStateKind {
    return this.#shared.playState.load();
  }

  canPlay(): boolean {
    return this.#shared.audioBufferFull.load();
  }

  async play(): Promise<void> {
    if (!this.#audioRenderer) {
      throw Error('WVAudioRenderer is undefined');
    }
    this.#shared.playState.store(WVPlayStateKind.PLAYING);
    await this.#audioRenderer.start();
    this.mainLoop();
  }

  async pause(): Promise<void> {
    if (!this.#audioRenderer) {
      throw Error('WVAudioRenderer is undefined');
    }
    this.#shared.playState.store(WVPlayStateKind.PAUSED);
    await this.#audioRenderer.pause();
  }

  private async mainLoop(): Promise<void> {
    if (this.#shared.playState.load() !== WVPlayStateKind.PLAYING) {
      return;
    }

    if (!this.#videoRenderer || !this.#audioRenderer) {
      logger.error('Renderers are not initialized yet', 'WVPlayer');
      return;
    }

    const currentTime = this.#audioRenderer.currentTime();
    const topFrame = this.#videoDecoder.dequeue(this.#shared, currentTime);
    if (topFrame) {
      this.#videoRenderer.draw(topFrame);
      this.#videoDecoder.pop(this.#shared);
    }

    requestAnimationFrame(this.mainLoop.bind(this));
  }
}
