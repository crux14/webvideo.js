import { VIDEO_DECODER_WORKER_PATH, VIDEO_DECODER_WORKER_NAME } from '../../core/constants';
import { WVSharedState, serializeWVSharedState } from '../../core/state';
import type { WVMediaStreamInfo } from '../../media/media';
import { logger } from '../../core/logger';

export class WVVideoDecoderWorkerFront {
  #worker: Worker;
  #videoFrames: VideoFrame[] = [];
  #maxVideoFrameLength: number;

  constructor(options: { maxVideoFrameLength: number }) {
    this.#worker = new Worker(VIDEO_DECODER_WORKER_PATH, {
      type: 'module',
      name: VIDEO_DECODER_WORKER_NAME,
    });
    this.#maxVideoFrameLength = options.maxVideoFrameLength;
  }

  init(sharedState: WVSharedState): Promise<WVMediaStreamInfo> {
    return new Promise((resolve) => {
      this.#worker.onmessage = (e) => {
        switch (e.data.msg) {
          case 'VideoDecoder_sendVideoStreamInfo': {
            resolve(e.data.videoStream);
            break;
          }
          case 'VideoDecoder_sendVideoFrame': {
            this.push(sharedState, e.data.frame);
            break;
          }
        }
      };

      this.#worker.postMessage({
        msg: 'Main_requestVideoDecoderStart',
        sharedState: serializeWVSharedState(sharedState),
      });
    });
  }

  async uninit(sharedState: WVSharedState): Promise<void> {
    return new Promise((resolve) => {
      this.#worker.onmessage = (e) => {
        switch (e.data.msg) {
          case 'VideoDecoder_notifyClosed': {
            this.#worker.terminate();
            resolve();
            break;
          }
        }
      };

      while (this.#videoFrames.length > 0) {
        this.pop(sharedState);
      }

      sharedState.videoDecoderShouldBeDead.store(true);

      this.#worker.postMessage({
        msg: 'Main_requestVideoDecoderClose',
      });
    });
  }

  start(): void {
    this.#worker.postMessage({
      msg: 'Main_requestVideoDecoderDecode',
    });
  }

  dequeue(sharedState: WVSharedState, currentTime: number): VideoFrame | null {
    while (this.#videoFrames.length > 0) {
      if (!this.#videoFrames[0].timestamp) {
        this.pop(sharedState);
        continue;
      }

      const deltaUs = this.#videoFrames[0].timestamp - currentTime * 1000000;

      if (deltaUs < -0.1 * 1000000) {
        logger.trace('chooseFrame(): frame dropped', 'WVVideoDecoderWorkerFront');
        this.pop(sharedState);
        continue;
      } else if (deltaUs > 0.1 * 1000000) {
        logger.trace('chooseFrame(): frame too fast', 'WVVideoDecoderWorkerFront');
        return null;
      } else {
        return this.#videoFrames[0];
      }
    }

    return null;
  }

  front(): VideoFrame | null {
    return this.#videoFrames.length > 0 ? this.#videoFrames[0] : null;
  }

  private push(sharedState: WVSharedState, frame: VideoFrame): void {
    this.#videoFrames.push(frame);
    if (this.#videoFrames.length > this.#maxVideoFrameLength) {
      sharedState.videoBufferFull.store(true);
    }
  }

  pop(sharedState: WVSharedState): void {
    const frame = this.#videoFrames.shift();
    if (frame) {
      frame.close();
      if (this.#videoFrames.length < this.#maxVideoFrameLength) {
        sharedState.videoBufferFull.store(false);
      }
    }
  }
}
