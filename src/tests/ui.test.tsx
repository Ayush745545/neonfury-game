// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { useMatchStore } from '../game/matchStore';
import { HUD } from '../ui/HUD';
import { Announcer } from '../ui/Announcer';
import { CharacterSelect } from '../ui/CharacterSelect';
import { PauseMenu } from '../ui/PauseMenu';
import { ControlsGuide } from '../ui/ControlsGuide';
import { SettingsPanel } from '../ui/SettingsPanel';
import { ResultsScreen } from '../ui/Results';
import { GameEngine } from '../game/GameEngine';
import { bus } from '../game/eventBus';
import { MAX_HEALTH } from '../config/constants';
import { useSettings } from '../config/settings';

beforeEach(() => cleanup());

/* DOM-level smoke tests for the UI tree (no WebGL needed). */

describe('match store flow', () => {
  beforeEach(() => {
    useMatchStore.setState({
      screen: 'menu', p1Char: null, p2Char: null, showResults: false,
      health: [MAX_HEALTH, MAX_HEALTH], meter: [0, 0], roundsWon: [0, 0],
      combo: [{ count: 0, damage: 0 }, { count: 0, damage: 0 }],
    });
  });

  it('menu → select → stage → game (vs cpu)', () => {
    const st = useMatchStore.getState();
    st.gotoSelect('vs-cpu');
    expect(useMatchStore.getState().screen).toBe('select');
    useMatchStore.getState().pickChar('p1', 'ryden');
    useMatchStore.getState().pickChar('p2', 'vesper');
    useMatchStore.getState().setStage('foundry');
    useMatchStore.getState().setScreen('stage');
    expect(useMatchStore.getState().screen).toBe('stage');
    expect(useMatchStore.getState().stageId).toBe('foundry');
    useMatchStore.getState().startMatch();
    expect(useMatchStore.getState().screen).toBe('game');
  });

  it('local mode requires both picks', () => {
    useMatchStore.getState().gotoSelect('local');
    useMatchStore.getState().pickChar('p1', 'kaito');
    expect(useMatchStore.getState().p2Char).toBeNull(); // mirror allowed, p2 must choose
    useMatchStore.getState().pickChar('p2', 'kaito');
    expect(useMatchStore.getState().p2Char).toBe('kaito');
  });
});

describe('HUD', () => {
  it('renders names, health widths, timer and meter', () => {
    useMatchStore.setState({
      health: [750, 400], meter: [55, 100], timeLeft: 42, round: 2,
      roundsWon: [1, 0], combo: [{ count: 4, damage: 210 }, { count: 0, damage: 0 }],
      phase: 'fight',
    });
    render(<HUD p1Name="RYDEN" p2Name="KAITO" p1Char="ryden" p2Char="kaito" />);
    expect(screen.getByText('RYDEN')).toBeTruthy();
    expect(screen.getByText('KAITO')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('ROUND 2')).toBeTruthy();
    expect(screen.getByText('4 HITS')).toBeTruthy();
    expect(screen.getByText('210 DMG')).toBeTruthy();
    expect(screen.getByText('★ SUPER READY — SPACE ★')).toBeTruthy();
    const fills = document.querySelectorAll<HTMLElement>('.health-fill');
    expect(fills[0].style.width).toBe('75%');
    expect(fills[1].style.width).toBe('40%');
  });

  it('timer turns urgent under 10s', () => {
    useMatchStore.setState({ timeLeft: 7, phase: 'fight', combo: [{ count: 0, damage: 0 }, { count: 0, damage: 0 }] });
    render(<HUD p1Name="A" p2Name="B" p1Char="ryden" p2Char="kaito" />);
    expect(document.querySelector('.timer-num.urgent')).toBeTruthy();
  });
});

describe('Announcer', () => {
  it('shows announce text on bus events', async () => {
    render(<Announcer />);
    act(() => { bus.emit({ type: 'announce', text: 'FIGHT!', style: 'fight' }); });
    const el = document.querySelector('.announce-text');
    expect(el?.textContent).toBe('FIGHT!');
    expect(el?.className).toContain('announce-fight');
  });

  it('flash overlay responds to flash events', () => {
    render(<Announcer />);
    act(() => { bus.emit({ type: 'flash', intensity: 0.8, color: '#fff' }); });
    const f = document.querySelector<HTMLElement>('.flash-overlay');
    expect(f).toBeTruthy();
  });
});

describe('screens render', () => {
  it('character select lists the full 15-fighter roster', () => {
    useMatchStore.setState({ screen: 'select', mode: 'vs-cpu', p1Char: null, p2Char: null });
    render(<CharacterSelect />);
    for (const name of ['RYDEN', 'KAITO', 'VESPER', 'GRUUN', 'YUKI', 'EMBER', 'VOLT', 'NYX',
      'ORACLE', 'SLAB', 'SABLE', 'HEX', 'SOLARA', 'FEN', 'ZERO']) {
      expect(screen.getAllByText(name).length, `roster missing ${name}`).toBeGreaterThan(0);
    }
    expect(document.querySelectorAll('.roster-card').length).toBe(15);
    // detail panel shows the focused fighter's unique ability
    expect(screen.getByText(/ABILITY/)).toBeTruthy();
  });

  it('character select click picks P1 and a distinct CPU opponent', async () => {
    useMatchStore.setState({ screen: 'select', mode: 'vs-cpu', p1Char: null, p2Char: null });
    render(<CharacterSelect />);
    fireEvent.click(screen.getAllByText('RYDEN')[0].closest('.roster-card')!);
    const st = useMatchStore.getState();
    expect(st.p1Char).toBe('ryden');
    expect(st.p2Char).toBeTruthy();
    expect(st.p2Char).not.toBe('ryden');
  });

  it('pause menu fires callbacks', () => {
    let resumed = false, quit = false;
    render(<PauseMenu onResume={() => { resumed = true; }} onRestart={() => {}} onQuit={() => { quit = true; }} />);
    fireEvent.click(screen.getByText('Resume'));
    expect(resumed).toBe(true);
    render(<PauseMenu onResume={() => {}} onRestart={() => {}} onQuit={() => { quit = true; }} />);
    fireEvent.click(screen.getAllByText('Quit to Menu')[0]);
    expect(quit).toBe(true);
  });

  it('controls guide shows default bindings', () => {
    render(<ControlsGuide />);
    expect(screen.getAllByText('Num 1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SPACE').length).toBeGreaterThan(0);
  });

  it('settings panel toggles difficulty and quality', () => {
    render(<SettingsPanel onClose={() => {}} />);
    fireEvent.click(screen.getAllByText('hard')[0]);
    fireEvent.click(screen.getAllByText('medium')[0]);
    expect(useSettings.getState().difficulty).toBe('hard');
    expect(useSettings.getState().quality).toBe('medium');
    // restore
    fireEvent.click(screen.getAllByText('normal')[0]);
    fireEvent.click(screen.getAllByText('high')[0]);
  });

  it('results screen shows winner + stats and buttons work', () => {
    const engine = new GameEngine({ mode: 'vs-cpu', p1Char: 'ryden', p2Char: 'kaito', seed: 1 });
    engine.match.matchWinner = 0;
    engine.match.stats[0] = { maxCombo: 7, damage: 812 };
    useMatchStore.setState({ showResults: true, matchWinner: 0, roundsWon: [2, 1] });
    let rematched = false;
    render(<ResultsScreen engine={engine} onRematch={() => { rematched = true; }} onChars={() => {}} onMenu={() => {}} />);
    expect(screen.getAllByText('RYDEN').length).toBeGreaterThan(0);
    expect(screen.getByText('812')).toBeTruthy();
    fireEvent.click(screen.getByText('Rematch'));
    expect(rematched).toBe(true);
  });
});
