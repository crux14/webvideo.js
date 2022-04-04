declare module 'mp4box' {
  interface MP4MediaTrack {
    id: number;
    type: 'video' | 'audio' | string;
    created: Date;
    modified: Date;
    movie_duration: number;
    layer: number;
    alternate_group: number;
    volume: number;
    track_width: number;
    track_height: number;
    timescale: number;
    duration: number;
    bitrate: number;
    codec: string;
    language: string;
    nb_samples: number;
  }

  interface MP4VideoData {
    width: number;
    height: number;
  }

  interface MP4VideoTrack extends MP4MediaTrack {
    video: MP4VideoData;
  }

  interface MP4AudioData {
    sample_rate: number;
    channel_count: number;
    sample_size: number;
  }

  interface MP4AudioTrack extends MP4MediaTrack {
    audio: MP4AudioData;
  }

  type MP4Track = MP4VideoTrack | MP4AudioTrack;

  interface MP4Info {
    duration: number;
    timescale: number;
    fragment_duration: number;
    isFragmented: boolean;
    isProgressive: boolean;
    hasIOD: boolean;
    brands: string[];
    created: Date;
    modified: Date;
    tracks: MP4Track[];
    videoTracks: MP4VideoTrack[];
    audioTracks: MP4AudioTrack[];
  }

  export type MP4ArrayBuffer = ArrayBuffer & { fileStart: number };

  interface MP4Sample {
    number: number;
    track_id: number;
    description: any;
    is_rap: boolean;
    timescale: number;
    dts: number;
    cts: number;
    duration: number;
    size: number;
    data: MP4ArrayBuffer;
    is_sync: boolean;
  }

  export interface MP4File {
    onMoovStart?: () => void;
    onReady?: (info: MP4Info) => void;
    onError?: (e: string) => void;

    onSamples?: (id: number, user: any, samples: MP4Sample[]) => void;

    setExtractionOptions(
      track_id: number,
      user: any,
      options: { nbSamples?: number; rapAlignement?: boolean }
    ): void;

    unsetExtractionOptions(track_id: number): void;

    seek(timeSec: number, useRap: boolean): void;

    appendBuffer(data: MP4ArrayBuffer): number;
    start(): void;
    stop(): void;
    flush(): void;
  }

  export function createFile(): MP4File;
}
