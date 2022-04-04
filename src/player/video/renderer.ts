import type { WVMediaStreamInfo } from '../../media/media';

export class WVVideoRenderer {
  #canvasElem: HTMLCanvasElement;
  #canvasCtx: CanvasRenderingContext2D;

  constructor(canvasElem: HTMLCanvasElement, videoStream: WVMediaStreamInfo) {
    this.#canvasElem = canvasElem;
    this.#canvasElem.width = videoStream.video!.width;
    this.#canvasElem.height = videoStream.video!.height;
    this.#canvasCtx = canvasElem.getContext('2d') as CanvasRenderingContext2D;
  }

  draw(frame: VideoFrame): void {
    this.#canvasCtx.drawImage(frame, 0, 0, frame.displayWidth, frame.displayHeight);
  }

  clear(): void {
    this.#canvasCtx.clearRect(0, 0, this.#canvasElem.width, this.#canvasElem.height);
  }
}
