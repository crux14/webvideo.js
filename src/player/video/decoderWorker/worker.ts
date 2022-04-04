import { WVSharedState, deserializeWVSharedState } from '../../../core/state';
import { sleep } from '../../../core/utils';

import { createWVMediaDemuxer } from '../../../media/format/demuxer';
import { createWVMediaDecoder } from '../../../media/codec/decoder';
import type { WVMediaDecoder } from '../../../media/codec/decoder';
import type { WVMediaStreamInfo } from '../../../media/media';
import { logger } from '../../../core/logger';

type VideoDecoderWorkerState = {
  sharedState?: WVSharedState;
  decoder?: WVMediaDecoder;
  videoStream?: WVMediaStreamInfo;
};

const workerState: VideoDecoderWorkerState = {};

self.addEventListener('message', async (e) => {
  switch (e.data.msg) {
    case 'Main_requestVideoDecoderStart': {
      workerState.sharedState = deserializeWVSharedState(e.data.sharedState);
      logger.setLevel(workerState.sharedState.loglevel);

      workerState.decoder = await createWVMediaDecoder(
        'WebCodecs',
        await createWVMediaDemuxer('MP4Box')
      );
      const mediaInfo = await workerState.decoder.open(workerState.sharedState!.videoUrl, 'video');
      workerState.videoStream = mediaInfo.streams.filter((s) => s.type === 'video')[0];

      if (!workerState.videoStream) {
        logger.error('No video stream found', 'WVVideoDecoderWorker');
        return;
      }

      self.postMessage({
        msg: 'VideoDecoder_sendVideoStreamInfo',
        videoStream: workerState.videoStream,
      });

      break;
    }

    case 'Main_requestVideoDecoderDecode': {
      if (!workerState.videoStream || !workerState.decoder) {
        logger.error('VideoDecoderWorkerState is not initialized', 'WVVideoDecoderWorker');
        return;
      }

      for await (const data of workerState.decoder!.decode(workerState.videoStream!.streamIndex)) {
        if (workerState.sharedState!.videoDecoderShouldBeDead.load()) {
          break;
        }
        if (data.eof) {
          logger.debug('eof detected', 'WVVideoDecoderWorker');
          break;
        }

        if (data.frame && data.frame.type() == 'video') {
          while (workerState.sharedState!.videoBufferFull.load()) {
            Atomics.wait(workerState.sharedState!.videoBufferFull.buf(), 0, 1, 10 * 1000);
            if (workerState.sharedState!.videoDecoderShouldBeDead.load()) {
              return;
            }
            // logger.trace('...waiting', 'WVVideoDecoderWorker');
          }

          const frame = data.frame.nativeFrame() as VideoFrame;
          self.postMessage(
            {
              msg: 'VideoDecoder_sendVideoFrame',
              frame,
            },
            // @ts-ignore
            [frame]
          );
          continue;
        }

        await sleep(4);
      }

      break;
    }

    case 'Main_requestVideoDecoderClose': {
      if (workerState.decoder) {
        await workerState.decoder.destroy();
      }
      self.postMessage({
        msg: 'VideoDecoder_notifyClosed',
      });
      break;
    }
  }
});
