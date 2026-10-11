import { useEffect } from 'react';
import { useMatchStore } from '../game/matchStore';
import { MainMenu } from '../ui/MainMenu';
import { CharacterSelect } from '../ui/CharacterSelect';
import { StageSelect } from '../ui/StageSelect';
import { NetLobby } from '../ui/NetLobby';
import { GameScreen } from './GameScreen';
import { audio } from '../audio/audioEngine';
import '../ui/styles.css';

/* Top-level screen router + one-time audio unlock on first gesture. */

export default function App() {
  const screen = useMatchStore((s) => s.screen);

  useEffect(() => {
    const unlock = () => {
      audio.init();
      audio.resume();
      audio.startMusic();
    };
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    const blockScroll = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', blockScroll, { passive: false });
    return () => window.removeEventListener('keydown', blockScroll);
  }, []);

  return (
    <>
      {screen === 'menu' && <MainMenu />}
      {screen === 'select' && <CharacterSelect />}
      {screen === 'stage' && <StageSelect />}
      {screen === 'net' && <NetLobby />}
      {screen === 'game' && <GameScreen />}
    </>
  );
}
