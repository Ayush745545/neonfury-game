import { useEffect, useState, useSyncExternalStore } from 'react';
import { netSession, isOnlineLobby } from '../net/session';
import { useMatchStore } from '../game/matchStore';
import { audio } from '../audio/audioEngine';

/* Network multiplayer lobby.
   ONLINE (deployed site): both peers connect to the Vercel lobby
   relay (wss://<site>/api/lobby) — same WiFi or across the internet.
   LAN: one machine runs `npm run host` (server/host.mjs) and peers
   connect to its WebSocket on the same WiFi. */

function useNetSession() {
  useSyncExternalStore(
    (cb) => netSession.subscribe(cb),
    () => netSession.status + netSession.error + netSession.lanUrl + JSON.stringify(netSession.peerCfg),
  );
  return netSession;
}

export function NetLobby() {
  const session = useNetSession();
  const gotoMenu = useMatchStore((s) => s.gotoMenu);
  const setScreen = useMatchStore((s) => s.setScreen);
  const setNet = useMatchStore((s) => s.setNet);
  const [tab, setTab] = useState<'host' | 'join'>('host');
  const [room, setRoom] = useState(() => `NF-${Math.floor(1000 + Math.random() * 9000)}`);
  const online = isOnlineLobby();
  const [addr, setAddr] = useState(() => {
    const h = window.location.hostname;
    return h && h !== 'localhost' && h !== '127.0.0.1' ? `${h}:4173` : '';
  });

  const st = session.status;
  const screen = useMatchStore((s) => s.screen);

  // when pairing completes, move to the pick screens
  useEffect(() => {
    if (st === 'paired' && screen === 'net') {
      useMatchStore.getState().gotoSelect('net');
    }
  }, [st, screen]);

  const startHost = () => {
    audio.play('ui');
    setNet('host');
    session.connect('host', `localhost:4173`, room);
  };
  const startJoin = () => {
    audio.play('ui');
    if (!addr.trim()) return;
    setNet('guest');
    session.connect('guest', addr, room);
  };

  const statusText = () => {
    switch (st) {
      case 'connecting': return 'Connecting to server…';
      case 'waiting-peer':
        return session.role === 'host'
          ? <>Hosting room <b>{session.room}</b> — waiting for a friend to join…</>
          : 'Connected — waiting for host…';
      case 'paired': return <b>Opponent connected! Pick your fighter…</b>;
      case 'waiting-cfg': return 'Locked in — waiting for opponent to confirm…';
      case 'ready': return <b>FIGHT LOADING…</b>;
      case 'in-match': return <b>IN MATCH</b>;
      case 'peer-left': return <span className="err">Opponent disconnected.</span>;
      case 'error': return <span className="err">{session.error || 'Connection failed.'}</span>;
      default: return '';
    }
  };

  return (
    <div className="net-root">
      <div className="nf-panel net-card">
        <div className="overlay-title" style={{ fontSize: 26, marginBottom: 6 }}>NETWORK PLAY</div>
        <div className="small-note" style={{ marginBottom: 16 }}>
          {online
            ? <>Online lobby on this site — same WiFi <b>or</b> anywhere with internet</>
            : <>Same-WiFi multiplayer · one machine runs <b>npm run host</b>, both open its address</>}
        </div>

        {(st === 'idle' || st === 'error' || st === 'peer-left') && (
          <>
            <div className="net-row" style={{ marginBottom: 16 }}>
              <button className={`seg-btn ${tab === 'host' ? 'on' : ''}`} onClick={() => { setTab('host'); audio.play('uiHover'); }}>HOST GAME</button>
              <button className={`seg-btn ${tab === 'join' ? 'on' : ''}`} onClick={() => { setTab('join'); audio.play('uiHover'); }}>JOIN GAME</button>
            </div>

            {tab === 'host' ? (
              <>
                <label className="set-label">ROOM CODE</label>
                <input className="net-input" value={room} maxLength={12}
                  onChange={(e) => setRoom(e.target.value.toUpperCase())} />
                <button className="nf-btn" style={{ width: '100%' }} onClick={startHost}>CONNECT AS HOST</button>
                {online ? (
                  <div className="net-help">
                    Both players open <b>{window.location.href}</b>.<br />
                    You: HOST GAME · your friend: JOIN GAME with the same room code. Host is Player 1 and picks the stage.
                  </div>
                ) : (
                  <div className="net-help">
                    1. On this machine run <b>npm run build</b> once, then <b>npm run host</b>.<br />
                    2. Your friend (same WiFi) opens <b>{session.lanUrl || 'http://&lt;your-ip&gt;:4173'}</b>.<br />
                    3. They pick JOIN GAME and enter this room code. Host is Player 1 and picks the stage.
                  </div>
                )}
              </>
            ) : (
              <>
                {!online && (
                  <>
                    <label className="set-label">HOST ADDRESS (ip:port)</label>
                    <input className="net-input" placeholder="192.168.1.23:4173" value={addr}
                      onChange={(e) => setAddr(e.target.value)} />
                  </>
                )}
                <label className="set-label">ROOM CODE</label>
                <input className="net-input" value={room} maxLength={12}
                  onChange={(e) => setRoom(e.target.value.toUpperCase())} />
                <button className="nf-btn" style={{ width: '100%' }} onClick={startJoin}>JOIN GAME</button>
                <div className="net-help">
                  {online
                    ? <>Guest is Player 2. The relay is this site — no address needed, just match the room code.</>
                    : <>The host's terminal prints the exact address after <b>npm run host</b>. Guest is Player 2.</>}
                </div>
              </>
            )}
          </>
        )}

        {(st === 'connecting' || st === 'waiting-peer' || st === 'waiting-cfg' || st === 'paired' || st === 'ready' || st === 'in-match') && (
          <>
            <div className="net-status">{statusText()}</div>
            {session.role === 'host' && session.lanUrl && st === 'waiting-peer' && (
              <div className="net-code">FRIEND JOINS AT: {session.lanUrl} · ROOM {session.room}</div>
            )}
            {st === 'paired' && (
              <button className="nf-btn" style={{ width: '100%' }}
                onClick={() => { audio.play('ui'); useMatchStore.getState().gotoSelect('net'); }}>
                CONTINUE TO FIGHTER SELECT
              </button>
            )}
            {(st === 'waiting-cfg') && (
              <div className="small-note">Both players must lock in their fighter{session.role === 'host' ? ' and stage' : ''}.</div>
            )}
          </>
        )}

        {st === 'peer-left' && (
          <button className="nf-btn" style={{ width: '100%' }} onClick={() => { audio.play('ui'); session.disconnect(); }}>BACK</button>
        )}

        <div style={{ marginTop: 18 }}>
          <button className="nf-btn" style={{ width: '100%' }}
            onClick={() => { audio.play('ui'); session.disconnect(); gotoMenu(); }}>
            Quit to Menu
          </button>
        </div>
      </div>
      <button className="nf-btn" style={{ width: 220, marginTop: 10 }} onClick={() => { audio.play('ui'); session.disconnect(); setScreen('menu'); }}>
        ← Main Menu
      </button>
    </div>
  );
}
