import { WVMediaInfo, WVMediaFrame } from '../media';
import { WVMediaDemuxer } from '../format/demuxer';

export interface WVMediaDecoder {
  open(url: string, mediaType: 'video' | 'audio'): Promise<WVMediaInfo>;
  destroy(): Promise<void>;
  decode(streamIndex: number): AsyncGenerator<{ frame: WVMediaFrame | null; eof: boolean }>;
}

export type WVMediaDecoderBackend = 'WebCodecs';

export async function createWVMediaDecoder(
  backend: WVMediaDecoderBackend = 'WebCodecs',
  demuxer: WVMediaDemuxer
): Promise<WVMediaDecoder> {
  // @ts-ignore
  const mod = await import(new URL(`./media/codec/decoder${backend}.js`, location.origin).href);
  return new mod.WebCodecsMediaDecoder(demuxer);
}
