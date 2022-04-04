import { AUDIO_WORKLET_NAME, AUDIO_WORKLET_PATH } from '../../core/constants';
import { WVSharedState, serializeWVSharedState } from '../../core/state';
import { WVMediaStreamInfo } from '../../media/media';

export class WVAudioRenderer {
  #audioCtx: AudioContext;
  #workletNode?: AudioWorkletNode;
  #gainNode?: GainNode;

  constructor(audioStream: WVMediaStreamInfo) {
    this.#audioCtx = new AudioContext({
      sampleRate: audioStream.audio!.sampleRate,
      latencyHint: 'playback',
    });
    this.#audioCtx.suspend();
  }

  async init(sharedState: WVSharedState, audioStream: WVMediaStreamInfo): Promise<MessagePort> {
    await this.#audioCtx.audioWorklet.addModule(AUDIO_WORKLET_PATH);
    this.#workletNode = new AudioWorkletNode(this.#audioCtx, AUDIO_WORKLET_NAME, {
      processorOptions: { sharedState: serializeWVSharedState(sharedState) },
      outputChannelCount: [audioStream.audio!.nbChannels],
    });

    this.#gainNode = new GainNode(this.#audioCtx, { gain: 0.5 });
    this.#workletNode.connect(this.#gainNode).connect(this.#audioCtx.destination);

    return this.#workletNode.port;
  }

  async start(): Promise<void> {
    await this.#audioCtx.resume();
  }

  async pause(): Promise<void> {
    await this.#audioCtx.suspend();
  }

  async close(): Promise<void> {
    this.#gainNode?.disconnect();
    this.#workletNode?.disconnect();
    this.#workletNode?.port.close();
    await this.#audioCtx.close();
  }

  currentTime(): number {
    return Math.max(this.#audioCtx.currentTime - this.#audioCtx.baseLatency, 0.0);
  }
}
