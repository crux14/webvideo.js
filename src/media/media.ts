export type WVMediaInfo = {
  duration: number;
  timescale: number;
  streams: WVMediaStreamInfo[];
};

export type WVMediaStreamType = 'video' | 'audio' | 'other';

export type WVMediaStreamInfo = {
  streamIndex: number;
  timescale: number;
  duration: number;
  bitrate: number;
  codec: string;
  nbSamples: number;
  type: WVMediaStreamType;
  video?: WVVideoStreamInfo;
  audio?: WVAudioStreamInfo;
};

export type WVVideoStreamInfo = {
  width: number;
  height: number;
  avcDescription?: Uint8Array;
};

export type WVAudioStreamInfo = {
  sampleRate: number;
  nbChannels: number;
  sampleSize: number;
};

export type WVMediaPacket = {
  streamIndex: number;
  timescale: number;
  dts: number;
  cts: number;
  duration: number;
  size: number;
  data: ArrayBuffer;
  hasKeyframe: boolean;
};

export interface WVMediaFrame {
  type(): 'video' | 'audio';
  info(): WVMediaFrameInfo;
  close(): void;
  nativeFrame(): unknown;
}

export type WVMediaFrameInfo = {
  readonly duration: number | null;
  readonly timestamp: number | null;
  video?: WVVideoFrameInfo;
  audio?: WVAudioFrameInfo;
};

export type WVVideoFrameInfo = {
  readonly buf?: Uint8Array;
  readonly colorSpace: WVVideoColorSpace;
  readonly format: WVVideoPixelFormat | null;
  readonly codedWidth: number;
  readonly codedHeight: number;
};

export type WVVideoColorSpace = VideoColorSpace;
export type WVVideoPixelFormat = VideoPixelFormat;

export type WVAudioFrameInfo = {
  readonly bufs: Float32Array[]; // length === nChannels
  readonly format: WVAudioSampleFormat;
  readonly nbChannels: number;
  readonly sampleRate: number;
};

export type WVAudioSampleFormat = AudioSampleFormat;
