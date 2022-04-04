import { AUDIO_WORKLET_NAME } from '../../../core/constants';
import { WVAudioRingBuffer } from '../../../core/ringbuffer';
import { logger } from '../../../core/logger';
import { WVSharedState, deserializeWVSharedState } from '../../../core/state';

let ringBuf: WVAudioRingBuffer | null = null;
let sharedState: WVSharedState | null = null;

class WVAudioWorkletProcessor extends AudioWorkletProcessor {
  constructor(options: any) {
    super();
    sharedState = deserializeWVSharedState(options.processorOptions.sharedState);
    logger.setLevel(sharedState.loglevel);
    this.port.onmessage = (e) => {
      switch (e.data.msg) {
        case 'Decoder_sendRingBuffer': {
          ringBuf = new WVAudioRingBuffer(e.data.initParams);
          break;
        }
      }
    };
  }

  process(_: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (!ringBuf) {
      logger.error('AudioRingBuffer is not yet initialized', 'WVAudioWorkletProcessor');
      return false;
    }
    if (!ringBuf.read(outputs[0])) {
      logger.error('Dequeue failed', 'WVAudioWorkletProcessor');
      return false;
    }
    return true;
  }
}

registerProcessor(AUDIO_WORKLET_NAME, WVAudioWorkletProcessor as any);
