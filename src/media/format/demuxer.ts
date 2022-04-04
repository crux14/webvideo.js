import { WVMediaInfo, WVMediaPacket } from '../media';

export interface WVMediaDemuxer {
  destroy(): void;
  loadFile(url: string): Promise<WVMediaInfo>;
  demux(streamIndex: number): AsyncGenerator<{ pkt: WVMediaPacket | null; eof: boolean }>;
}

export type WVMediaDemuxerBackend = 'MP4Box';

export async function createWVMediaDemuxer(
  backend: WVMediaDemuxerBackend = 'MP4Box'
): Promise<WVMediaDemuxer> {
  // @ts-ignore
  const mod = await import(new URL(`./media/format/demuxer${backend}.js`, location.origin).href);
  return new mod.MP4BoxMediaDemuxer();
}
