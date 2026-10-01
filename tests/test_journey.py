"""Full UI journey against a separate, restartable server and disposable database.

Run: py -3 -m tests.test_journey (installed Chrome/Edge required).
Use --netlify after npm run build to test the packaged function and local Blobs.
Only observes browser snapshots; all gameplay actions go through UI controls.
No chapter injection, clock changes, database edits, or download interception.
"""
import base64
from collections import deque
import json
import os
from pathlib import Path
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import time
import urllib.request

from tests.test_browser import DevTools
from tests import ROOT, APP

DIRECTIONS = {'up': (0, -1), 'down': (0, 1), 'left': (-1, 0), 'right': (1, 0)}
CLUES = ['the left star in the top row', 'the right star in the top row',
         'the far-left star in the middle row', 'the center star in the middle row',
         'the far-right star in the middle row', 'the left star in the lower pair',
         'the right star in the lower pair', 'the single star at the very bottom']
OBSERVE = """
window.browserErrors=[];
window.addEventListener('error',e=>browserErrors.push(e.message));
window.addEventListener('unhandledrejection',e=>browserErrors.push(String(e.reason)));
const originalFetch=window.fetch;
window.fetch=async(...args)=>{
  const response=await originalFetch(...args);
  if(String(args[0]).includes('/.netlify/functions/game')&&response.ok){
    const data=await response.clone().json();
    if(data.phase&&(!window.latestSnapshot||data.version>=window.latestSnapshot.version))window.latestSnapshot=data;
  }
  return response;
};
const NativeEventSource=window.EventSource;
window.EventSource=class extends NativeEventSource {
  constructor(...args){super(...args);this.addEventListener('message',e=>window.latestSnapshot=JSON.parse(e.data));}
};
"""


def snapshot(page):
    return page.evaluate('window.latestSnapshot')


def ready(pages):
    for p in pages:
        p.wait("document.querySelector('#ready')&&!document.querySelector('#ready').disabled", 15)
        p.click('#ready')
    for p in pages:
        p.wait("latestSnapshot?.phase==='playing'&&!latestSnapshot.paused", 15)


def progress(pages, count):
    for p in pages:
        p.wait(f"document.querySelectorAll('.stamp.done').length==={count}")
        assert p.evaluate(f"document.querySelector('.journey h2').textContent===new Intl.NumberFormat(undefined,{{maximumFractionDigits:0}}).format(latestSnapshot.distance*{1-count/4})+' km to go'")


def fly(pages, step):
    pilot, gunner = pages[step % 2], pages[1-step % 2]
    pilot.wait("!!document.querySelector('#launch-flight')")
    pilot.click('#launch-flight')
    pilot.call('Page.bringToFront')
    pilot.evaluate("document.querySelector('#adventure-board').focus()")
    steering = 0
    deadline = time.monotonic()+130
    reported = 0
    try:
        while time.monotonic() < deadline:
            s = snapshot(pilot)
            if s['step'] != step or s['phase'] != 'playing':
                print(f'PASS: flight {step+1}, real-time UI steering and cooperative firing', flush=True)
                return
            a = s['adventure']
            if time.monotonic() - reported > 10:
                print(f"Flight {step+1}: {int(a['x'])}/{a['length']}, paused={s['paused']}", flush=True)
                reported = time.monotonic()
            if not a['running']:
                pilot.click('#launch-flight')
            stamp = next((x for x in a['stamps'] if not x['got'] and x['x'] > a['x']-25), None)
            target = stamp['y'] if stamp else 365
            direction = 0 if abs(target-a['y']) < 14 else (1 if target > a['y'] else -1)
            if direction != steering:
                if steering:
                    key = 'ArrowDown' if steering > 0 else 'ArrowUp'
                    pilot.call('Input.dispatchKeyEvent', type='keyUp', key=key, code=key)
                if direction:
                    key = 'ArrowDown' if direction > 0 else 'ArrowUp'
                    pilot.call('Input.dispatchKeyEvent', type='keyDown', key=key, code=key)
                steering = direction
            gunner.evaluate("document.querySelector('#fire-pellet')?.click(); true")
            if any(not o['gone'] and 0 < o['x']-a['x'] < 100 and abs(o['y']-a['y']) < 60 for o in a['objects']):
                gunner.evaluate("document.querySelector('#flight-shield')?.click()")
            time.sleep(.12)
        raise AssertionError('UI flight did not finish: '+str(snapshot(pilot)))
    finally:
        for key in ['ArrowUp', 'ArrowDown']:
            pilot.call('Input.dispatchKeyEvent', type='keyUp', key=key, code=key)


def move(pages, player, target):
    p = pages[player]
    s = snapshot(p)
    pos = s['adventure']['positions'][player]
    direction = next(k for k, (dx, dy) in DIRECTIONS.items() if [pos[0]+dx, pos[1]+dy] == target)
    p.click(f'[data-move={direction}]')
    for peer in pages:
        peer.wait(f"latestSnapshot.phase!=='playing'||latestSnapshot.epoch>{s['epoch']}||JSON.stringify(latestSnapshot.adventure.positions[{player}])==={json.dumps(json.dumps(target,separators=(',',':')))}")


def navigate(pages, player, target):
    a = snapshot(pages[player])['adventure']
    queue = deque([(a['positions'][player], [])])
    seen = set()
    while queue:
        pos, path = queue.popleft()
        if pos == target:
            for cell in path:
                move(pages, player, cell)
            return
        if tuple(pos) in seen:
            continue
        seen.add(tuple(pos))
        for dx, dy in DIRECTIONS.values():
            cell = [pos[0]+dx, pos[1]+dy]
            if cell not in a['cells'] or (cell == a['bridge'] and not a['horizontal']):
                continue
            if any(cell == g['cell'] and g['label'] not in a['opened'] and a['positions'][1-player] != g['plate'] for g in a['gates']):
                continue
            queue.append((cell, path+[cell]))
    raise AssertionError(f'No visible route to {target}')


def main():
    netlify = '--netlify' in sys.argv
    browser = next((str(p) for p in [Path(r'C:\Program Files\Google\Chrome\Application\chrome.exe'),
        Path(r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe')] if p.is_file()), None)
    browser = browser or shutil.which('google-chrome') or shutil.which('chromium')
    if not browser:
        raise SystemExit('Install Chrome or Edge to run this optional check.')
    server_process = browser_process = None
    pages = []
    with tempfile.TemporaryDirectory(prefix='closer-journey-') as folder:
        temp = Path(folder)
        assert temp.resolve().parent == Path(tempfile.gettempdir()).resolve()
        server_log = (temp/'server.log').open('wb')
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
        base = f'http://127.0.0.1:{port}'
        def start_server():
            command = [shutil.which('node') or 'node', str(ROOT/'tests/netlify/local-server.mjs'), str(port), str(temp/'netlify')] if netlify else [sys.executable, '-u', str(APP/'server.py'), '--host', '127.0.0.1', '--port', str(port), '--db', str(temp/'test.sqlite3')]
            proc = subprocess.Popen(command, cwd=ROOT,
                stdout=server_log, stderr=subprocess.STDOUT,
                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            deadline = time.monotonic()+12
            while time.monotonic() < deadline:
                try:
                    with urllib.request.urlopen(base, timeout=1): return proc
                except OSError: time.sleep(.1)
            proc.terminate();proc.wait(timeout=5)
            raise AssertionError('Test server did not start')
        try:
            server_process = start_server()
            profile = temp/'browser'
            browser_process = subprocess.Popen([browser, '--headless=new', '--disable-gpu', '--no-first-run',
                '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--disable-background-networking',
                '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
                '--remote-debugging-port=0', '--user-data-dir='+str(profile), 'about:blank'],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            active = profile/'DevToolsActivePort';deadline = time.monotonic()+15
            while not active.exists():
                if time.monotonic() > deadline: raise AssertionError('Browser did not start')
                time.sleep(.05)
            debug_port = active.read_text().splitlines()[0]
            with urllib.request.urlopen(f'http://127.0.0.1:{debug_port}/json/version') as response: info = json.load(response)
            control = DevTools(info['webSocketDebuggerUrl'])
            def page(width):
                target = control.call('Target.createTarget', url='about:blank')['targetId']
                p = DevTools(f'ws://127.0.0.1:{debug_port}/devtools/page/{target}');pages.append(p)
                p.call('Page.enable');p.call('Runtime.enable')
                p.call('Emulation.setDeviceMetricsOverride', width=width, height=844, deviceScaleFactor=1, mobile=False)
                p.call('Page.addScriptToEvaluateOnNewDocument', source=OBSERVE)
                p.call('Page.navigate', url=base);p.wait("!!document.querySelector('#setup-form')")
                return p
            a, b = page(1280), page(390)
            b.evaluate("document.querySelector('#name').value='Guest';document.querySelector('#city').value='Unlisted city';document.querySelector('#setup-form button[type=submit]').click()")
            b.wait("document.querySelector('#setup-error').textContent.includes('coordinates')")
            profiles = [dict(name='María-José Éléonore 東京 Müller', city='San Cristóbal de las Casas — región histórica de Chiapas, México', lat=16.737, lon=-92.637),
                        dict(name='François Zoë 京都 García-López', city='東京都千代田区 — Tokyo, Japan', lat=35.681, lon=139.768)]
            for i, p in enumerate([a, b]):
                if i: p.click('#join-tab')
                p.evaluate(f"Object.entries({json.dumps(profiles[i])}).forEach(([k,v])=>document.querySelector('#'+k).value=v);document.querySelector('.custom-location').open=true")
                if i: p.evaluate(f"document.querySelector('#room-code').value={json.dumps(code)}")
                p.click('#setup-form button[type=submit]')
                code = p.wait("document.querySelector('#copy-code')?.textContent")
            a.wait("latestSnapshot?.players.length===2")
            third = page(390);third.click('#join-tab')
            third.evaluate(f"document.querySelector('#name').value='Third guest';document.querySelector('#city').value='London, United Kingdom';document.querySelector('#room-code').value={json.dumps(code)};document.querySelector('#setup-form button[type=submit]').click()")
            third.wait("document.querySelector('#setup-error').textContent.includes('two players')")
            # Chat uses the real form, including repeated submissions and the mobile dialog.
            a.evaluate("document.querySelector('#chat-input').value='A clue with accents: corazón 東京';document.querySelector('#chat-form').requestSubmit();document.querySelector('#chat-form').requestSubmit()")
            b.wait("document.querySelector('#chat-toggle').textContent==='Chat (1)'")
            assert len(snapshot(b)['messages']) == 1
            b.click('#chat-toggle')
            assert b.evaluate("document.querySelector('#mobile-chat').open&&document.activeElement.id==='chat-input'")
            b.evaluate("document.querySelector('#chat-input').value='Ready to travel';document.querySelector('#chat-form').requestSubmit()")
            a.wait("latestSnapshot.messages.length===2")
            b.call('Page.bringToFront')
            b.call('Input.dispatchKeyEvent', type='keyDown', key='Escape', code='Escape', windowsVirtualKeyCode=27)
            b.call('Input.dispatchKeyEvent', type='keyUp', key='Escape', code='Escape', windowsVirtualKeyCode=27)
            b.wait("!document.querySelector('#mobile-chat').open")
            b.wait("document.activeElement.id==='chat-toggle'&&document.querySelector('#chat-toggle').textContent==='Chat'")
            ready([a, b])
            assert b.evaluate("getComputedStyle(document.querySelector('#journey .interactive-map')).display==='none'")
            b.click('#map-toggle')
            assert b.evaluate("getComputedStyle(document.querySelector('#journey .interactive-map')).display!=='none'")
            b.click('#map-toggle')
            for step in range(2): fly([a, b], step)
            progress([a, b], 1);ready([a, b])
            print('PASS: setup, Unicode profiles, chat/unread/focus, map toggle, 25% distance', flush=True)
            for step in range(3):
                for p in [a, b]: p.wait(f"latestSnapshot.stage===1&&latestSnapshot.step==={step}")
                paths = [snapshot(b)['adventure']['partner_chart']['path'], snapshot(a)['adventure']['partner_chart']['path']]
                b.click('[data-trail=partner]')
                assert b.evaluate("getComputedStyle(document.querySelector('.trail-charts>section')).display==='none'")
                b.click('[data-trail=own]')
                for j in range(1, len(paths[0])):
                    for i in range(2): move([a, b], i, paths[i][j])
            progress([a, b], 2);ready([a, b])
            # Genuine loss of the second SSE connection, then resume the same seat.
            saved = snapshot(a)['adventure']['positions']
            b.call('Page.navigate', url='about:blank')
            a.wait('latestSnapshot.paused', 18)
            b.call('Page.navigate', url=base);b.wait("!!document.querySelector('#ready')", 15)
            assert snapshot(b)['adventure']['positions'] == saved
            ready([a, b])
            navigate([a, b], 0, [1, 1])
            saved = snapshot(a)['adventure']['positions']
            server_process.terminate();server_process.wait(timeout=10)
            a.wait("document.querySelector('#network-status').textContent.includes('Reconnecting')", 12)
            if netlify: time.sleep(7)  # Serverless rooms pause on missed heartbeats, not cold starts.
            server_process = start_server()
            for p in [a, b]: p.wait("latestSnapshot.paused&&!!document.querySelector('#ready')", 20)
            assert snapshot(a)['adventure']['positions'] == saved
            assert len(snapshot(b)['messages']) == 2
            ready([a, b])
            print('PASS: all lantern trails, 50% distance, actual disconnect and server restart retain progress', flush=True)
            for step in range(3):
                for p in [a, b]: p.wait(f"latestSnapshot.stage===2&&latestSnapshot.step==={step}")
                navigate([a, b], 0, [1, 1]);navigate([a, b], 1, [4, 2])
                if step == 2:
                    navigate([a, b], 1, [4, 3]);b.click('#turn-bridge')
                    for p in [a, b]: p.wait('latestSnapshot.adventure.horizontal')
                if step:
                    navigate([a, b], 0, [4, 5]);navigate([a, b], 1, [7, 2])
                navigate([a, b], 0, [8, 3]);navigate([a, b], 1, [8, 3])
            progress([a, b], 3);ready([a, b])
            print('PASS: all bridge crossings, both pressure plates, rotating bridge, 75% distance', flush=True)
            a.click('[data-star="7"]');b.click('[data-star="7"]')
            for p in [a, b]:
                p.wait("latestSnapshot.feedback.includes('Not quite')")
                assert snapshot(p)['adventure']['threads'] == []
            for step in range(3):
                for p in [a, b]: p.wait(f"latestSnapshot.stage===3&&latestSnapshot.step==={step}")
                while not snapshot(a)['adventure'].get('complete'):
                    sa, sb = snapshot(a), snapshot(b)
                    picks = [CLUES.index(sb['adventure']['clue']), CLUES.index(sa['adventure']['clue'])]
                    for i, p in enumerate([a, b]): p.click(f'[data-star="{picks[i]}"]')
                    for p in [a, b]: p.wait(f"latestSnapshot.epoch>{sa['epoch']}")
                for p in [a, b]: p.wait("!!document.querySelector('.completed-threads')")
                a.evaluate("document.querySelector('#continue-stars').click();document.querySelector('#continue-stars').click()")
                a.wait("document.querySelector('#continue-stars').disabled")
                assert snapshot(a)['step'] == step
                b.click('#continue-stars')
                for p in [a, b]: p.wait(f"latestSnapshot.step>{step}||latestSnapshot.phase==='victory'")
            for p in [a, b]: p.wait("document.querySelectorAll('.stamp.done').length===4&&!!document.querySelector('#download')")
            # Miles in one tab must not alter the shared souvenir's canonical kilometre distance.
            b.click('#units')
            a.click('#heart');b.wait("document.querySelector('.couple').classList.contains('reacting')")
            output = ROOT/'artifacts'/('netlify' if netlify else 'python');output.mkdir(parents=True, exist_ok=True)
            downloads = []
            for i, p in enumerate([a, b]):
                folder = temp/f'download-{i}';folder.mkdir()
                control.call('Browser.setDownloadBehavior', behavior='allow', downloadPath=str(folder))
                p.click('#download');file = folder/'a-little-closer-postcard.png'
                deadline = time.monotonic()+12
                while not file.exists():
                    if time.monotonic() > deadline: raise AssertionError('Native PNG download did not complete')
                    time.sleep(.1)
                data = file.read_bytes()
                assert data[:8] == b'\x89PNG\r\n\x1a\n' and struct.unpack('!II', data[16:24]) == (1600, 1100)
                assert len(data) > 10000
                downloads.append(data)
                assert p.evaluate('browserErrors') == [], p.evaluate('browserErrors')
                assert p.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Layout overflows'
            assert downloads[0] == downloads[1], 'Partners received different souvenirs'
            (output/'postcard-unicode.png').write_bytes(downloads[0])
            b.call('Emulation.setEmulatedMedia', features=[dict(name='prefers-reduced-motion', value='reduce')])
            assert b.evaluate("getComputedStyle(document.querySelector('.couple span')).animationName==='none'")
            (output/'victory-mobile.png').write_bytes(base64.b64decode(b.call('Page.captureScreenshot', format='png', captureBeyondViewport=True)['data']))
            print('PASS: all three glowing constellations, repeated confirmation, 100% progress, avatar reaction, reduced motion', flush=True)
            print('PASS: actual matching 1600 x 1100 PNG downloads, long Unicode names/cities, no browser errors', flush=True)
            server_log.flush()
            assert 'Traceback' not in (temp/'server.log').read_text(errors='replace'), 'Server raised an exception'
            control.call('Browser.close');browser_process.wait(timeout=10);control.socket.close()
        finally:
            for p in pages: p.socket.close()
            for proc in [browser_process, server_process]:
                if proc and proc.poll() is None: proc.terminate();proc.wait(timeout=10)
            server_log.close()


if __name__ == '__main__': main()
