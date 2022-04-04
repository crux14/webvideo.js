import MP4Box from 'mp4box';
import { WVMediaDemuxer } from './demuxer';
import {
  WVMediaInfo,
  WVMediaStreamInfo,
  WVVideoStreamInfo,
  WVAudioStreamInfo,
  WVMediaPacket,
  WVMediaStreamType,
} from '../media';
import { logger } from '../../core/logger';

type FileReader = {
  file: MP4Box.MP4File;
  reader: ReadableStreamDefaultReader<Uint8Array>;
  offset: number;
};

function createWVMediaPacket(sample: MP4Box.MP4Sample): WVMediaPacket {
  return {
    streamIndex: sample.track_id,
    timescale: sample.timescale,
    dts: sample.dts,
    cts: sample.cts,
    duration: sample.duration,
    size: sample.size,
    data: sample.data,
    hasKeyframe: sample.is_sync,
  };
}

// @ref: ttps://github.com/gpac/mp4box.js/issues/243
// @ref: ttps://github.com/gpac/mp4box.js/issues/243#issuecomment-921166223
function createAVCDescription(trackIdx: number, file: MP4Box.MP4File): Uint8Array | undefined {
  let avccBox;
  try {
    avccBox = (file as any).moov.traks[trackIdx].mdia.minf.stbl.stsd.entries[0].avcC;
  } catch (e) {
    return undefined;
  }

  if (!avccBox) {
    return undefined;
  }

  let i,
    size = 7;
  for (i = 0; i < avccBox.SPS.length; i++) size += 2 + avccBox.SPS[i].length;
  for (i = 0; i < avccBox.PPS.length; i++) size += 2 + avccBox.PPS[i].length;

  let id = 0;
  let data = new Uint8Array(size);

  let writeUint8 = (value: any) => {
    data.set([value], id);
    id++;
  };
  let writeUint16 = (value: any) => {
    let arr = new Uint8Array(1);
    arr[0] = value;
    let buffer = new Uint8Array(arr.buffer);
    data.set([buffer[1], buffer[0]], id);
    id += 2;
  };
  let writeUint8Array = (value: any) => {
    data.set(value, id);
    id += value.length;
  };

  writeUint8(avccBox.configurationVersion);
  writeUint8(avccBox.AVCProfileIndication);
  writeUint8(avccBox.profile_compatibility);
  writeUint8(avccBox.AVCLevelIndication);
  writeUint8(avccBox.lengthSizeMinusOne + (63 << 2));
  writeUint8(avccBox.nb_SPS_nalus + (7 << 5));

  for (i = 0; i < avccBox.SPS.length; i++) {
    writeUint16(avccBox.SPS[i].length);
    writeUint8Array(avccBox.SPS[i].nalu);
  }

  writeUint8(avccBox.nb_PPS_nalus);
  for (i = 0; i < avccBox.PPS.length; i++) {
    writeUint16(avccBox.PPS[i].length);
    writeUint8Array(avccBox.PPS[i].nalu);
  }

  if (id != size) {
    logger.debug('Size mismatched', 'MP4BoxMediaDemuxer');
    return undefined;
  }

  return data;
}

function createWVMediaStreamInfo(
  trackIdx: number,
  file: MP4Box.MP4File,
  track: MP4Box.MP4Track
): WVMediaStreamInfo {
  const streamType = track.type;
  let streamTypeStr: WVMediaStreamType = 'other';
  let video: WVVideoStreamInfo | undefined = undefined;
  let audio: WVAudioStreamInfo | undefined = undefined;
  if (streamType === 'video') {
    streamTypeStr = 'video';
    video = {
      width: (track as MP4Box.MP4VideoTrack).video.width,
      height: (track as MP4Box.MP4VideoTrack).video.height,
      avcDescription: createAVCDescription(trackIdx, file),
    };
  } else if (streamType === 'audio') {
    streamTypeStr = 'audio';
    audio = {
      sampleRate: (track as MP4Box.MP4AudioTrack).audio.sample_rate,
      nbChannels: (track as MP4Box.MP4AudioTrack).audio.channel_count,
      sampleSize: (track as MP4Box.MP4AudioTrack).audio.sample_size,
    };
  }

  return {
    streamIndex: track.id,
    timescale: track.timescale,
    duration: track.duration,
    bitrate: track.bitrate,
    codec: track.codec,
    nbSamples: track.nb_samples,
    type: streamTypeStr,
    video: video,
    audio: audio,
  };
}

function createWVMediaInfo(file: MP4Box.MP4File, info: MP4Box.MP4Info): WVMediaInfo {
  return {
    duration: info.duration,
    timescale: info.timescale,
    streams: info.tracks.map((track, idx) => createWVMediaStreamInfo(idx, file, track)),
  };
}

export class MP4BoxMediaDemuxer implements WVMediaDemuxer {
  #file: MP4Box.MP4File;
  #info: MP4Box.MP4Info | null = null;

  #fileReader: FileReader | null = null;

  constructor() {
    this.#file = MP4Box.createFile();
    this.#file.onError = (e) => {
      logger.error(e, 'MP4BoxMediaDemuxer');
    };
    this.#file.onMoovStart = () => {
      logger.debug('onMoovStart', 'MP4BoxMediaDemuxer');
    };
    this.#file.onReady = (info) => {
      this.#info = info;
    };
  }

  async loadFile(url: string): Promise<WVMediaInfo> {
    const resp = await fetch(url);

    if (!resp.body) {
      throw Error('MP4BoxMediaDemuxer FetchError: body is null');
    }
    const mime = resp.headers.get('Content-Type');
    if (!mime) {
      throw Error('MP4BoxMediaDemuxer FetchError: Content-Type is null');
    }
    if (mime !== 'video/mp4') {
      throw Error(
        'MP4BoxMediaDemuxer FetchError: Invalid file type found. Currently the only supported format is "video/mp4".'
      );
    }

    this.#fileReader = { file: this.#file, reader: resp.body.getReader(), offset: 0 };

    return new Promise((resolve) => {
      function onFileRead(
        this_: MP4BoxMediaDemuxer,
        result: ReadableStreamDefaultReadResult<Uint8Array>
      ): any {
        if (result.done) {
          this_.#file.flush();
          throw Error(
            'MP4BoxMediaDemuxer FetchError: FileRead ended before moov parsing is completed'
          );
        }

        const buf = result.value.buffer;
        // @ts-ignore
        buf.fileStart = this_.#fileReader!.offset;
        this_.#fileReader!.offset += buf.byteLength;
        // @ts-ignore
        this_.#file.appendBuffer(buf);

        if (this_.#info) {
          return resolve(createWVMediaInfo(this_.#file, this_.#info));
        } else {
          return this_.#fileReader!.reader.read().then((r) => onFileRead(this_, r));
        }
      }
      return this.#fileReader!.reader.read().then((r) => onFileRead(this, r));
    });
  }

  destroy() {
    if (this.#info) {
      for (const track of this.#info.tracks) {
        // @ts-ignore
        this.#file.releaseUsedSamples(track.id, track.nb_samples);
      }
    }

    if (this.#fileReader) {
      try {
        // [TODO] we do not know why this always fails
        this.#fileReader.file.flush();
      } catch (e) {
        logger.debug('flush() failed', 'MP4BoxMediaDemuxer');
      }
      this.#fileReader.reader.cancel().finally(() => {
        this.#fileReader?.reader.releaseLock();
      });
    }
  }

  async *demux(streamIndex: number): AsyncGenerator<{ pkt: WVMediaPacket | null; eof: boolean }> {
    if (!this.#fileReader) {
      throw Error(
        'MP4BoxMediaDemuxer Error: fileReader is null. Maybe you forget to call loadFile()?'
      );
    }
    if (!this.#info) {
      throw Error('MP4BoxMediaDemuxer Error: info is null. Maybe you forget to call loadFile()?');
    }

    const tracks = this.#info.tracks.filter((t) => t.id === streamIndex);
    if (tracks.length === 0) {
      throw Error('MP4BoxMediaDemuxer Error: No tracks found');
    }

    this.#file.setExtractionOptions(streamIndex, { nbSamples: 1 }, { nbSamples: 1 });

    const lastSampleIdx = tracks[0].nb_samples - 1;

    let eof = false;
    while (!eof) {
      try {
        const samples = await this.innerDemux();
        for (const sample of samples) {
          if (sample.number === lastSampleIdx) {
            eof = true;
          }
          yield { pkt: createWVMediaPacket(sample), eof: false };
        }
      } catch (e) {
        logger.error(e as any, 'MP4BoxMediaDemuxer');
      }
    }

    yield { pkt: null, eof: true };
  }

  private innerDemux(): Promise<MP4Box.MP4Sample[]> {
    return new Promise((resolve) => {
      this.#file.onSamples = (id: number, user: any, samples: MP4Box.MP4Sample[]) => {
        this.#file.stop();
        resolve(samples);
      };

      this.#file.start();

      function onFileRead(
        this_: MP4BoxMediaDemuxer,
        result: ReadableStreamDefaultReadResult<Uint8Array>
      ): any {
        if (result.done) {
          this_.#file.flush();
          return;
        }

        const buf = result.value.buffer;
        // @ts-ignore
        buf.fileStart = this_.#fileReader!.offset;
        this_.#fileReader!.offset += buf.byteLength;
        // @ts-ignore
        this_.#file.appendBuffer(buf);

        return this_.#fileReader!.reader.read().then((r) => onFileRead(this_, r));
      }
      return this.#fileReader!.reader.read()
        .then((r) => onFileRead(this, r))
        .catch((_) => {});
    });
  }
}
