import { WVPlayer } from './player/player';
import { WVPlayStateKind } from './core/state';

let player: WVPlayer | undefined;

enum PlayBtnIcon {
  FONTAWESOME_PLAY = '&#xf04b;',
  FONTAWESOME_PAUSE = '&#xf04c;',
}

function showLoader(loaderElem: HTMLElement): void {
  loaderElem.style.display = '';
}

function hideLoader(loaderElem: HTMLElement): void {
  loaderElem.style.display = 'none';
}

function showPlayBtn(playBtnWrapperElem: HTMLElement): void {
  playBtnWrapperElem.style.display = '';
}

function hidePlayBtn(playBtnWrapperElem: HTMLElement): void {
  playBtnWrapperElem.style.display = 'none';
}

function autohidePlayBtn(enable: boolean, playBtnWrapperElem: HTMLElement): void {
  playBtnWrapperElem.style.opacity = enable ? '0' : '1';
}

function setPlayBtnIcon(icon: PlayBtnIcon, playBtnElem: HTMLElement): void {
  playBtnElem.innerHTML = icon;
}

window.addEventListener('beforeunload', (e) => {
  function blockingSleep(waitMs: number): void {
    const start = new Date().getTime();
    while (new Date().getTime() - start < waitMs) {}
  }

  if (player?.loadCalled()) {
    player?.unload();
    blockingSleep(1000);
  }

  e.preventDefault();
  e.returnValue = '';
});

window.addEventListener('load', async () => {
  const selectBtnElem = document.querySelector('select#video_select') as HTMLSelectElement;
  const playBtnWrapperElem = document.querySelector('#play_btn_wrapper') as HTMLElement;
  const loaderElem = document.querySelector('#loader_wrapper') as HTMLElement;
  const playBtnElem = document.querySelector('#play_btn') as HTMLElement;

  selectBtnElem.addEventListener('change', async (e) => {
    const elem = e.target as HTMLOptionElement;

    if (elem.value) {
      if (player?.loadCalled()) {
        await player?.unload({
          onEnd: async () => {
            hidePlayBtn(playBtnWrapperElem);
            showLoader(loaderElem);
          },
        });
      }
      player = new WVPlayer({
        videoUrl: new URL(elem.value, location.origin).href,
        canvasElem: document.querySelector('#monitor') as HTMLCanvasElement,
      });
      await player.load({
        onStart: async () => {
          hidePlayBtn(playBtnWrapperElem);
          showLoader(loaderElem);
        },
        onEnd: async () => {
          hideLoader(loaderElem);
          showPlayBtn(playBtnWrapperElem);
          autohidePlayBtn(false, playBtnWrapperElem);
          setPlayBtnIcon(PlayBtnIcon.FONTAWESOME_PLAY, playBtnElem);
        },
      });
    }
  });

  setPlayBtnIcon(PlayBtnIcon.FONTAWESOME_PLAY, playBtnElem);
  playBtnElem.addEventListener('click', async () => {
    if (!player) {
      return;
    }
    switch (player.playState()) {
      case WVPlayStateKind.PAUSED: {
        if (player.canPlay()) {
          void player.play();
          autohidePlayBtn(true, playBtnWrapperElem);
          setPlayBtnIcon(PlayBtnIcon.FONTAWESOME_PAUSE, playBtnElem);
        }
        break;
      }
      case WVPlayStateKind.PLAYING: {
        void player.pause();
        autohidePlayBtn(false, playBtnWrapperElem);
        setPlayBtnIcon(PlayBtnIcon.FONTAWESOME_PLAY, playBtnElem);
        break;
      }
    }
  });
});
