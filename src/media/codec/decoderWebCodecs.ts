import {
  WVMediaInfo,
  WVMediaFrame,
  WVMediaStreamInfo,
  WVMediaPacket,
  WVMediaFrameInfo,
} from '../media';
import { WVMediaDemuxer } from '../format/demuxer';
import { WVMediaDecoder } from '../codec/decoder';
import { sleep } from '../../core/utils';
import { logger } from '../../core/logger';

type DecodedFrame = AudioData | VideoFrame;

class WebCodecsMediaFrame implements WVMediaFrame {
  #privFrame: DecodedFrame;
  #info: WVMediaFrameInfo | null = null;
  #type: 'video' | 'audio';
  constructor(frame: DecodedFrame) {
    this.#privFrame = frame;
    this.#type = frame instanceof VideoFrame ? 'video' : 'audio';
  }

  async load(): Promise<void> {
    if (this.#type === 'video') {
      const videoFrame = this.#privFrame as VideoFrame;

      this.#info = {
        timestamp: this.#privFrame.timestamp,
        duration: this.#privFrame.duration,
        video: {
          colorSpace: videoFrame.colorSpace,
          format: videoFrame.format,
          codedWidth: videoFrame.codedWidth,
          codedHeight: videoFrame.codedHeight,
        },
      };
    } else {
      const audioFrame = this.#privFrame as AudioData;

      const bufs = [];
      for (let i = 0; i < audioFrame.numberOfChannels; i++) {
        const buf = new Float32Array(audioFrame.numberOfFrames);
        audioFrame.copyTo(buf, { planeIndex: i, format: 'f32-planar' });
        bufs.push(buf);
      }

      this.#info = {
        timestamp: this.#privFrame.timestamp,
        duration: this.#privFrame.duration,
        audio: {
          bufs: bufs,
          format: audioFrame.format,
          nbChannels: audioFrame.numberOfChannels,
          sampleRate: audioFrame.sampleRate,
        },
      };
    }
  }

  type(): 'video' | 'audio' {
    return this.#type;
  }

  info(): WVMediaFrameInfo {
    return this.#info!;
  }

  close(): void {
    this.#privFrame.close();
  }

  nativeFrame(): DecodedFrame {
    return this.#privFrame;
  }
}

function toMicroSec(pkt: WVMediaPacket, attr: 'cts' | 'duration'): number {
  return (pkt[attr] * 1000000) / pkt.timescale;
}

function createVideoChunk(pkt: WVMediaPacket): EncodedVideoChunk {
  return new EncodedVideoChunk({
    type: pkt.hasKeyframe ? 'key' : 'delta',
    timestamp: toMicroSec(pkt, 'cts'),
    duration: toMicroSec(pkt, 'duration'),
    data: pkt.data,
  });
}

function createAudioChunk(pkt: WVMediaPacket): EncodedAudioChunk {
  return new EncodedAudioChunk({
    type: pkt.hasKeyframe ? 'key' : 'delta',
    timestamp: toMicroSec(pkt, 'cts'),
    duration: toMicroSec(pkt, 'duration'),
    data: pkt.data,
  });
}

async function selectVideoDecoderConfig(
  stream: WVMediaStreamInfo
): Promise<VideoDecoderConfig | null> {
  const config = {
    codec: stream.codec,
    description: stream.video!.avcDescription,
    hardwareAcceleration: 'prefer-hardware',
  } as VideoDecoderConfig;

  logger.debug('Trying hardware decoding...', 'WebCodecsMediaDecoder');

  let supportInfo = await VideoDecoder.isConfigSupported(config);
  if (!supportInfo.supported) {
    logger.debug('Codec not supported', 'WebCodecsMediaDecoder');
    logger.debug(supportInfo as any, 'WebCodecsMediaDecoder');
    logger.debug('Trying software decoding...', 'WebCodecsMediaDecoder');
  } else {
    logger.debug('Using hardware decoding', 'WebCodecsMediaDecoder');
    return config;
  }

  config.hardwareAcceleration = 'prefer-software';
  supportInfo = await VideoDecoder.isConfigSupported(config);
  if (!supportInfo.supported) {
    logger.debug('Codec not supported', 'WebCodecsMediaDecoder');
    logger.debug(supportInfo as any, 'WebCodecsMediaDecoder');
    return null;
  } else {
    logger.debug('Using software decoding', 'WebCodecsMediaDecoder');
    return config;
  }
}

async function createVideoDecoder(
  stream: WVMediaStreamInfo,
  output: (frame: DecodedFrame) => void
): Promise<VideoDecoder | null> {
  const config = await selectVideoDecoderConfig(stream);
  if (!config) {
    return null;
  }

  const decoder = new VideoDecoder({
    output,
    error: (e) => logger.error(e as any, 'WebCodecsMediaDecoder'),
  });

  decoder.configure(config);
  return decoder;
}

async function createAudioDecoder(
  stream: WVMediaStreamInfo,
  output: (frame: DecodedFrame) => void
): Promise<AudioDecoder | null> {
  const decoder = new AudioDecoder({
    output,
    error: (e) => logger.error(e as any, 'WebCodecsMediaDecoder'),
  });

  // [TODO] maybe we should parse the description?

  const config = {
    codec: stream.codec === 'mp4a.6b' ? 'mp3' : stream.codec,
    sampleRate: stream.audio!.sampleRate,
    numberOfChannels: stream.audio!.nbChannels,
  } as AudioDecoderConfig;

  const supportInfo = await AudioDecoder.isConfigSupported(config);
  if (!supportInfo.supported) {
    logger.error('Codec not supported', 'WebCodecsMediaDecoder');
    logger.error(supportInfo as any, 'WebCodecsMediaDecoder');
    return null;
  }

  decoder.configure(config);
  return decoder;
}

async function createDecoder(
  stream: WVMediaStreamInfo,
  output: (frame: DecodedFrame) => void
): Promise<VideoDecoder | AudioDecoder | null> {
  if (stream.type === 'video') {
    return await createVideoDecoder(stream, output);
  } else {
    return await createAudioDecoder(stream, output);
  }
}

export class WebCodecsMediaDecoder implements WVMediaDecoder {
  #demuxer: WVMediaDemuxer;
  #info: WVMediaInfo | null = null;

  #decoder: AudioDecoder | VideoDecoder | null = null;
  #decodedFrames: DecodedFrame[] = [];

  #onFrame: (d: DecodedFrame) => void = (data: DecodedFrame): void => {
    data.close();
  };

  #isDefunct: boolean = false;

  constructor(demuxer: WVMediaDemuxer) {
    this.#demuxer = demuxer;
  }

  async open(url: string, mediaType: 'video' | 'audio'): Promise<WVMediaInfo> {
    this.#info = await this.#demuxer.loadFile(url);

    await this.flushDecoders();

    this.#onFrame = (data) => {
      this.#decodedFrames.push(data);
    };

    for (const stream of this.#info.streams) {
      if (stream.type === mediaType) {
        const decoder = await createDecoder(stream, this.onOutput.bind(this));
        if (decoder) {
          this.#decoder = decoder;
          break;
        }
      }
    }

    return this.#info;
  }

  private onOutput(data: DecodedFrame): void {
    this.#onFrame(data);
  }

  async destroy(): Promise<void> {
    this.#isDefunct = true;

    this.#demuxer.destroy();

    this.#onFrame = (data) => {
      data.close();
    };

    this.clearFrames();

    if (this.#decoder) {
      await this.#decoder.flush();
      while (this.#decoder.decodeQueueSize > 0) {
        // [TODO] timeout
        await sleep(4);
      }
      this.#decoder.close();
    }
  }

  async *decode(streamIndex: number): AsyncGenerator<{ frame: WVMediaFrame | null; eof: boolean }> {
    if (!this.#decoder) {
      throw Error('WebCodecsMediaDecoder: No decoder exists');
    }

    for await (const data of this.#demuxer.demux(streamIndex)) {
      if (this.#isDefunct) {
        return;
      }
      if (data.eof) {
        break;
      }
      yield* this.flushFrames();
      if (!this.#isDefunct && data.pkt && data.pkt.data && this.#decoder.state === 'configured') {
        this.#decoder.decode(
          this.#decoder instanceof VideoDecoder
            ? createVideoChunk(data.pkt)
            : createAudioChunk(data.pkt)
        );
      }

      yield { frame: null, eof: false };
    }

    while (this.#decoder.decodeQueueSize > 0) {
      yield* this.flushFrames();
      await sleep(4);
    }

    await this.#decoder.flush();
    yield* this.flushFrames();

    yield { frame: null, eof: true };
  }

  private async *flushFrames(): AsyncGenerator<{ frame: WVMediaFrame | null; eof: boolean }> {
    while (this.#decodedFrames.length > 0) {
      const frame = new WebCodecsMediaFrame(this.#decodedFrames.shift()!);
      await frame.load();
      yield { frame, eof: false };
    }
  }

  private clearFrames(): void {
    for (const frame of this.#decodedFrames) {
      frame.close();
    }
    this.#decodedFrames = [];
  }

  private async flushDecoders(): Promise<void> {
    if (this.#decoder) {
      await this.#decoder.flush();
    }
  }
}
