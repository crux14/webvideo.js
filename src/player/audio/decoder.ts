import { AUDIO_DECODER_WORKER_PATH, AUDIO_DECODER_WORKER_NAME } from '../../core/constants';
import { WVSharedState, serializeWVSharedState } from '../../core/state';
import type { WVMediaStreamInfo } from '../../media/media';

export class WVAudioDecoderWorkerFront {
  #worker: Worker;

  constructor(options: {}) {
    this.#worker = new Worker(AUDIO_DECODER_WORKER_PATH, {
      type: 'module',
      name: AUDIO_DECODER_WORKER_NAME,
    });
  }

  init(sharedState: WVSharedState): Promise<WVMediaStreamInfo> {
    return new Promise((resolve) => {
      this.#worker.onmessage = (e) => {
        switch (e.data.msg) {
          case 'AudioDecoder_sendAudioStreamInfo': {
            resolve(e.data.audioStream);
            break;
          }
        }
      };
      this.#worker.postMessage({
        msg: 'Main_requestAudioDecoderStart',
        sharedState: serializeWVSharedState(sharedState),
      });
    });
  }

  async uninit(sharedState: WVSharedState): Promise<void> {
    return new Promise((resolve) => {
      this.#worker.onmessage = (e) => {
        switch (e.data.msg) {
          case 'AudioDecoder_notifyClosed': {
            this.#worker.terminate();
            resolve();
            break;
          }
        }
      };

      sharedState.audioDecoderShouldBeDead.store(true);
      sharedState.audioBufferFull.store(false);

      this.#worker.postMessage({
        msg: 'Main_requestAudioDecoderClose',
      });
    });
  }

  start(audioWorkletPort: MessagePort): void {
    this.#worker.postMessage(
      {
        msg: 'Main_requestAudioDecoderDecode',
      },
      [audioWorkletPort]
    );
  }
}
