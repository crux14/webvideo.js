import { WVAudioRingBuffer } from '../../../core/ringbuffer';
import { WVSharedState, deserializeWVSharedState } from '../../../core/state';
import { sleep } from '../../../core/utils';

import { createWVMediaDemuxer } from '../../../media/format/demuxer';
import { createWVMediaDecoder, WVMediaDecoder } from '../../../media/codec/decoder';
import type { WVMediaFrame, WVMediaStreamInfo } from '../../../media/media';
import { logger } from '../../../core/logger';

type AudioDecoderWorkerState = {
  audioWorkerPort?: MessagePort;
  sharedState?: WVSharedState;
  ringBuf?: WVAudioRingBuffer;
  decoder?: WVMediaDecoder;
  audioStream?: WVMediaStreamInfo;
};

const workerState: AudioDecoderWorkerState = {};

async function pushSamples(state: AudioDecoderWorkerState, frame: WVMediaFrame): Promise<void> {
  while (!state.ringBuf!.writable()) {
    state.ringBuf!.waitForWritable(10 * 1000);
    // logger.trace('...waiting', 'WVAudioDecoderWorker');
    if (state.sharedState!.audioDecoderShouldBeDead.load()) {
      return;
    }
  }
  state.ringBuf!.write(frame.info().audio!.bufs);
}

function initAudioRingBuffer(state: AudioDecoderWorkerState): WVAudioRingBuffer {
  const options = {
    channels: state.audioStream!.audio!.nbChannels,
    bufLength: 128 * 400,
    thresholdWaitBufLength: 1024,
  };

  const bufSet = {
    bufSabs: [] as SharedArrayBuffer[],
    lockSab: state.sharedState!.audioBufferFull.sab(),
    idxSabs: [new SharedArrayBuffer(4), new SharedArrayBuffer(4)],
  };
  for (let ch = 0; ch < options.channels; ch++) {
    bufSet.bufSabs.push(new SharedArrayBuffer(4 * options.bufLength));
  }

  return new WVAudioRingBuffer({ bufSet, options });
}

self.addEventListener('message', async (e) => {
  switch (e.data.msg) {
    case 'Main_requestAudioDecoderStart': {
      workerState.sharedState = deserializeWVSharedState(e.data.sharedState);

      logger.setLevel(workerState.sharedState.loglevel);

      workerState.decoder = await createWVMediaDecoder(
        'WebCodecs',
        await createWVMediaDemuxer('MP4Box')
      );
      const mediaInfo = await workerState.decoder.open(workerState.sharedState!.videoUrl, 'audio');
      workerState.audioStream = mediaInfo.streams.filter((s) => s.type === 'audio')[0];

      if (!workerState.audioStream) {
        logger.error('No audio stream found', 'WVAudioDecoderWorker');
        return;
      }

      workerState.ringBuf = initAudioRingBuffer(workerState);

      self.postMessage({
        msg: 'AudioDecoder_sendAudioStreamInfo',
        audioStream: workerState.audioStream,
      });

      break;
    }

    case 'Main_requestAudioDecoderDecode': {
      if (!workerState.audioStream || !workerState.decoder || !workerState.ringBuf) {
        logger.error('AudioDecoderWorkerState is not initialized', 'WVAudioDecoderWorker');
        return;
      }

      workerState.audioWorkerPort = e.ports[0];

      workerState.audioWorkerPort.postMessage({
        msg: 'Decoder_sendRingBuffer',
        initParams: workerState.ringBuf!.initParams(),
      });

      for await (const data of workerState.decoder!.decode(workerState.audioStream!.streamIndex)) {
        if (workerState.sharedState!.audioDecoderShouldBeDead.load()) {
          break;
        }
        if (data.eof) {
          logger.debug('eof detected', 'WVAudioDecoderWorker');
          break;
        }
        if (data.frame) {
          if (data.frame.type() == 'audio') {
            await pushSamples(workerState, data.frame);
            data.frame.close();
            continue;
          }
        }
        await sleep(4);
      }

      break;
    }

    case 'Main_requestAudioDecoderClose': {
      if (workerState.decoder) {
        await workerState.decoder.destroy();
      }
      self.postMessage({
        msg: 'AudioDecoder_notifyClosed',
      });
      break;
    }
  }
});
