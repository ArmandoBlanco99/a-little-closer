#!/usr/bin/env python3
"""A Little Closer: dependency-free local multiplayer prototype (Python 3.10+)."""
import argparse
import errno
import json
import math
import mimetypes
from pathlib import Path
import secrets
import sqlite3
import threading
import time
import webbrowser
import adventures
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / 'public'
# Preserve existing local rooms when updating from the original flat layout.
DEFAULT_DB = ROOT.parent / 'rooms.sqlite3'
SYMBOLS = ['Sun', 'Moon', 'Leaf', 'Heart', 'Flower', 'Cloud']
STARS = ['Luna', 'Nova', 'Sol', 'Vega', 'Lyra', 'Orion']
LOCK = threading.RLock()
ROOMS = {}
SEEN = {}
RATE = {}
DB = None

class GameError(Exception):
    pass

def init_db(path):
    global DB, ROOMS
    DB = sqlite3.connect(path, check_same_thread=False)
    DB.execute('CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, payload TEXT NOT NULL)')
    ROOMS = {}
    for code, payload in DB.execute('SELECT code,payload FROM rooms'):
        r = json.loads(payload)
        if time.time() - r['updated'] < 86400:
            if r['phase'] == 'playing':
                r['paused'] = True
                r['holds'] = {}
                for p in r['players']: p['ready'] = False
                adventures.stop(r)
            ROOMS[code] = r
        else:
            DB.execute('DELETE FROM rooms WHERE code=?', (code,))
    DB.commit()

def save(r):
    r['updated'] = time.time()
    r['version'] += 1
    DB.execute('INSERT OR REPLACE INTO rooms VALUES (?,?)', (r['code'], json.dumps(r)))
    DB.commit()

def online(p):
    return p.get('bot', False) or time.time() - SEEN.get(p['id'], 0) < 6

def holding(r, key):
    hold = r['holds'].get(key)
    return bool(hold and (hold.get('latched', False) or time.time()-hold['last'] < 1.6))

def update_lantern(r):
    if r['phase'] != 'playing' or r['stage'] != 1 or r['paused']:
        return False
    if not all(online(p) for p in r['players']) or not all(holding(r, str(i)) for i in range(2)):
        return False
    overlap = time.time()-max(h['start'] for h in r['holds'].values())
    duration = r['secret']['duration'] * (0.65 if r['relaxed'] else 1)
    if overlap < duration:
        return False
    if all(r['selection'].get(str(i)) == r['secret']['symbol'] for i in range(2)):
        advance(r)
    else:
        r['holds'] = {}
        r['feedback'] = 'Different lanterns! Tell each other the symbol, then light them together again.'
    return True

def validate_profile(d):
    name = str(d.get('name', '')).strip()[:28]
    city = str(d.get('city', '')).strip()[:80]
    try:
        lat, lon = float(d['lat']), float(d['lon'])
    except (KeyError, ValueError, TypeError):
        raise GameError('Choose a city or enter valid coordinates.')
    if not name or not city or not math.isfinite(lat + lon) or not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise GameError('Add your name and a valid city location.')
    avatar = d.get('avatar', 'fox')
    if avatar not in ['fox', 'rabbit', 'bear', 'cat']: avatar = 'fox'
    return dict(id=secrets.token_hex(16), token=secrets.token_urlsafe(32), name=name, city=city, lat=lat, lon=lon, avatar=avatar, ready=False)

def distance(a, b):
    p, q = math.radians(a['lat']), math.radians(b['lat'])
    dp, dl = q-p, math.radians(b['lon']-a['lon'])
    h = math.sin(dp/2)**2 + math.cos(p)*math.cos(q)*math.sin(dl/2)**2
    return 6371.0088 * 2 * math.asin(math.sqrt(min(1, max(0, h))))

def new_puzzle(r):
    r['epoch'] += 1
    r['selection'] = {}
    r['holds'] = {}
    r['feedback'] = ''
    if r.get('edition') == 2:
        adventures.new(r)
        return
    n, step = r['stage'], r['step']
    if n == 0:
        r['secret'] = {'target': secrets.SystemRandom().sample(SYMBOLS, 4)}
        r['placed'] = []
    elif n == 1:
        r['secret'] = {'symbol': secrets.choice(SYMBOLS), 'duration': [1.2, 2.5][secrets.randbelow(2)]}
    elif n == 2:
        r['secret'] = {'target': secrets.SystemRandom().sample(['Plank', 'Arch', 'Rope'], 3)}
        r['placed'] = []
    else:
        r['secret'] = {'target': secrets.SystemRandom().sample(STARS, 2)}

def create(d):
    p = validate_profile(d)
    alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    code = ''.join(secrets.choice(alphabet) for _ in range(6))
    while code in ROOMS: code = ''.join(secrets.choice(alphabet) for _ in range(6))
    r = dict(code=code, players=[p], phase='lobby', stage=0, step=0, epoch=0, version=0,
             paused=False, relaxed=False, distance=0, messages=[], actions=[], secret={}, holds={},
             selection={}, placed=[], threads=[], feedback='', updated=time.time(), date=None)
    r['edition'] = 2
    r['practice'] = d.get('practice') is True
    if r['practice']:
        partner = validate_profile(dict(name='Practice partner', city='Madrid, Spain', lat=40.4168, lon=-3.7038, avatar='rabbit'))
        partner['bot'] = True
        r['players'].append(partner)
        r['distance'] = distance(*r['players'])
    ROOMS[code] = r
    SEEN[p['id']] = time.time()
    save(r)
    return {'code': code, 'token': p['token'], 'player': p['id']}

def join(d):
    r = get_room(str(d.get('code', '')).strip().upper())
    if len(r['players']) >= 2: raise GameError('This room already has two players. Reopen it in your original browser to reconnect.')
    p = validate_profile(d)
    r['players'].append(p)
    r['distance'] = distance(*r['players'])
    SEEN[p['id']] = time.time()
    save(r)
    return {'code': r['code'], 'token': p['token'], 'player': p['id']}

def get_room(code):
    r = ROOMS.get(code)
    if not r or time.time()-r['updated'] >= 86400: raise GameError('Room not found or expired. Check the code.')
    return r

def auth(code, token):
    r = get_room(code)
    for i,p in enumerate(r['players']):
        if secrets.compare_digest(p['token'], token): return r,i
    raise GameError('Your player session is not valid for this room.')

def snapshot(r, i):
    # Never send the puzzle's full secret, player credentials, or action log.
    s = {k:r[k] for k in ['code','phase','stage','step','epoch','version','paused','relaxed','distance','placed','feedback','date']}
    s['players'] = [{k:v for k,v in p.items() if k != 'token'} | {'online':online(p)} for p in r['players']]
    s['me'] = r['players'][i]['id']
    s['messages'] = r['messages'][-30:]
    s['threads'] = r.get('threads', [])
    s['selection'] = {str(j): (r['selection'].get(str(j)) if j == i else bool(r['selection'].get(str(j)))) for j in range(2)}
    s['holding'] = [holding(r, str(j)) for j in range(2)]
    s['latched'] = [bool(r['holds'].get(str(j), {}).get('latched', False)) for j in range(2)]
    s['clue'] = None
    if r.get('edition') == 2:
        s.update(edition=2, practice=r.get('practice',False), discoveries=r.get('discoveries', []),
                 collected_stamps=r.get('collected_stamps',0), constellations=r.get('constellations', []))
        if r['phase'] == 'playing': s['adventure'] = adventures.view(r,i)
        return s
    if r['phase'] == 'playing':
        sec = r['secret']
        if r['stage'] in [0,2]:
            guide = r['step'] % 2
            s['role'] = 'guide' if i == guide else 'builder'
            if i == guide: s['clue'] = sec['target']
        elif r['stage'] == 1:
            s['role'] = 'symbol' if i == r['step'] % 2 else 'duration'
            s['clue'] = {'symbol':sec['symbol']} if s['role'] == 'symbol' else {'duration':sec['duration']}
        else:
            s['role'] = 'left' if i == 0 else 'right'
            # Each player tells their partner which endpoint the partner must select.
            s['clue'] = sec['target'][1-i]
    return s

def advance(r):
    r['step'] += 1
    required = (adventures.COUNTS if r.get('edition') == 2 else [2,6,2,5])[r['stage']]
    if r['step'] >= required:
        r['phase'] = 'checkpoint'
        r['holds'] = {}
        for p in r['players']: p['ready'] = False
        if r.get('practice'):
            r['phase'] = 'practice_complete'
            return
        if r['stage'] == 3:
            r['phase'] = 'victory'
            r['date'] = time.strftime('%B %d, %Y', time.gmtime())
    else: new_puzzle(r)

def apply(r, i, d):
    action = d.get('action')
    aid = str(d.get('id', ''))[:80]
    aid = r['players'][i]['id'] + ':' + aid if aid else ''
    if not aid: raise GameError('Action ID is required.')
    if aid in r['actions']: return snapshot(r,i)
    p = r['players'][i]
    SEEN[p['id']] = time.time()
    if action == 'chat':
        msg = str(d.get('text','')).strip()[:240]
        if msg: r['messages'].append({'name':p['name'], 'text':msg, 'id':aid})
        r['messages'] = r['messages'][-30:]
    elif action == 'relaxed' and r['phase'] == 'lobby':
        r['relaxed'] = bool(d.get('value'))
    elif action == 'pause' and r['phase'] == 'playing':
        r['paused'] = True
        r['holds'] = {}
        for player in r['players']: player['ready'] = False
        adventures.stop(r)
    elif action == 'ready':
        if len(r['players']) < 2: raise GameError('Wait for your partner to join.')
        if r['phase'] in ['victory','practice_complete'] or (r['phase']=='playing' and not r['paused']):
            raise GameError('This round is already underway.')
        p['ready'] = True
        if r.get('practice'): r['players'][1]['ready'] = True
        if all(x['ready'] and online(x) for x in r['players']):
            if r['paused']:
                r['paused'] = False
                adventures.stop(r)
            else:
                if r['phase'] == 'checkpoint': r['stage'] += 1
                r['phase'] = 'playing'
                r['step'] = 0
                new_puzzle(r)
            for player in r['players']: player['ready'] = False
    elif action == 'heart' and r['phase'] == 'victory':
        r['messages'].append({'name':p['name'], 'text':'♥', 'id':aid})
        r['messages'] = r['messages'][-30:]
    else:
        if r['phase'] != 'playing' or r['paused']: raise GameError('Wait until both players are ready.')
        if not all(online(x) for x in r['players']): raise GameError('Your partner is reconnecting.')
        if d.get('epoch') != r['epoch']: raise GameError('The puzzle has moved on. Try your next move.')
        n = r['stage']
        if r.get('edition') == 2:
            adventures.act(r, i, d, advance)
        elif n in [0,2]:
            if i == r['step'] % 2: raise GameError('You are the guide. Describe your clues to your partner.')
            choices = SYMBOLS if n == 0 else ['Plank','Arch','Rope']
            if action == 'place':
                val = d.get('value')
                if val not in choices: raise GameError('Choose one of the available pieces.')
                if len(r['placed']) < len(r['secret']['target']): r['placed'].append(val)
            elif action == 'undo':
                if r['placed']: r['placed'].pop()
            elif action == 'check':
                if r['placed'] == r['secret']['target']: advance(r)
                else: r['feedback'] = 'Nearly! Compare the pieces from left to right. You can undo and try again.'
            else: raise GameError('That action is not available in this puzzle.')
        elif n == 1:
            key = str(i)
            if action == 'select':
                if d.get('value') not in SYMBOLS: raise GameError('Choose a lantern symbol.')
                r['selection'][key] = d['value']
                r['holds'].pop(key, None)
            elif action in ['hold', 'latch']:
                if key not in r['selection']: raise GameError('Choose a lantern first.')
                now = time.time()
                prev = r['holds'].get(key)
                if not holding(r, key): prev = {'start':now}
                prev['last'] = now
                if action == 'latch': prev['latched'] = True
                r['holds'][key] = prev
                update_lantern(r)
            elif action == 'release': r['holds'].pop(key, None)
            else: raise GameError('That action is not available in this puzzle.')
        elif n == 3:
            if action != 'select' or d.get('value') not in STARS: raise GameError('Choose your star endpoint.')
            r['selection'][str(i)] = d['value']
            if len(r['selection']) == 2:
                if [r['selection']['0'],r['selection']['1']] == r['secret']['target']:
                    r.setdefault('threads', []).append(r['secret']['target'][:])
                    advance(r)
                else:
                    r['selection'] = {}
                    r['feedback'] = 'That thread needs another try. Tell your partner the name on your clue.'
    r['actions'] = (r['actions'] + [aid])[-500:]
    save(r)
    return snapshot(r,i)

def watchdog():
    while True:
        time.sleep(0.1)
        with LOCK:
            for code,r in list(ROOMS.items()):
                if time.time()-r['updated'] >= 86400:
                    del ROOMS[code]
                    DB.execute('DELETE FROM rooms WHERE code=?',(code,))
                    DB.commit()
                elif r['phase']=='playing' and not r['paused'] and not all(online(p) for p in r['players']):
                    r['paused'] = True
                    r['holds'] = {}
                    r['feedback'] = 'Connection paused. Your progress is safe; both tap Ready when you return.'
                    for p in r['players']: p['ready'] = False
                    adventures.stop(r)
                    save(r)
                elif r.get('edition') == 2:
                    if adventures.tick(r, time.time(), advance): save(r)
                elif update_lantern(r):
                    save(r)

class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def handle(self):
        try: super().handle()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError): pass
    def log_message(self, *args): pass
    def respond(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store')
        self.end_headers()
        self.wfile.write(body)
    def do_POST(self):
        try:
            origin = self.headers.get('Origin')
            if origin and urlparse(origin).netloc != self.headers.get('Host'): raise GameError('Cross-origin requests are not allowed.')
            size = int(self.headers.get('Content-Length','0'))
            if size > 8192 or size <= 0: raise GameError('Invalid request size.')
            d = json.loads(self.rfile.read(size))
            if not isinstance(d,dict): raise GameError('Invalid request.')
            with LOCK:
                if self.path in ['/api/create','/api/join']:
                    ip = self.client_address[0]
                    attempts = [t for t in RATE.get(ip,[]) if time.time()-t < 60]
                    if len(attempts) >= 30: raise GameError('Too many attempts. Please wait a minute.')
                    RATE[ip] = attempts + [time.time()]
                    result = create(d) if self.path.endswith('create') else join(d)
                elif self.path == '/api/action':
                    r,i = auth(str(d.get('code','')), self.headers.get('Authorization','').removeprefix('Bearer '))
                    result = apply(r,i,d)
                else:
                    self.respond({'error':'Not found'},404)
                    return
            self.respond(result)
        except (GameError, ValueError, TypeError, KeyError) as e:
            self.respond({'error':str(e)},400)
        except (BrokenPipeError, ConnectionResetError): pass
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/events':
            query = parse_qs(parsed.query)
            try:
                with LOCK:
                    r,i = auth(query.get('code',[''])[0],query.get('token',[''])[0])
            except GameError as e:
                self.respond({'error':str(e)},403)
                return
            try:
                self.send_response(200)
                self.send_header('Content-Type','text/event-stream')
                self.send_header('Cache-Control','no-cache')
                self.send_header('Connection','keep-alive')
                self.send_header('X-Accel-Buffering','no')
                self.end_headers()
                previous = ''
                while True:
                    with LOCK:
                        r = get_room(r['code'])
                        SEEN[r['players'][i]['id']] = time.time()
                        payload = json.dumps(snapshot(r,i))
                    if payload != previous:
                        self.wfile.write(('data: '+payload+'\n\n').encode())
                        previous = payload
                    else: self.wfile.write(b': heartbeat\n\n')
                    self.wfile.flush()
                    time.sleep(0.1 if r.get('edition') == 2 and r['stage'] == 0 else 0.3)
            except (BrokenPipeError, ConnectionResetError, GameError): return
            return
        if parsed.path == '/api/health':
            self.respond({'ok':True})
            return
        path = (PUBLIC / (parsed.path.lstrip('/') or 'index.html')).resolve()
        if not path.is_relative_to(PUBLIC) or not path.is_file():
            self.respond({'error':'Not found'},404)
            return
        body = path.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type',mimetypes.guess_type(str(path))[0] or 'application/octet-stream')
        self.send_header('Content-Length',str(len(body)))
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Cache-Control','no-cache')
        self.end_headers()
        try: self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError): pass

def bind_server(host, port, auto_port=False):
    try:
        return ThreadingHTTPServer((host, port), Handler)
    except OSError as exc:
        conflict = exc.errno in (errno.EACCES, errno.EADDRINUSE) or getattr(exc, 'winerror', None) in (10013, 10048)
        if not auto_port or port == 0 or not conflict:
            raise
        print(f'Port {port} is unavailable. Asking Windows/your OS for an available port.', flush=True)
        return ThreadingHTTPServer((host, 0), Handler)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--host',default='0.0.0.0')
    parser.add_argument('--port',type=int,default=8080)
    parser.add_argument('--db',default=str(DEFAULT_DB))
    parser.add_argument('--open-browser',action='store_true')
    parser.add_argument('--auto-port',action='store_true',help='Choose an available port if the requested one is blocked or occupied.')
    args = parser.parse_args()
    try:
        server = bind_server(args.host, args.port, args.auto_port)
    except OSError as exc:
        parser.exit(1, f'Cannot start the local server: {exc}\nTry: py -3 a-little-closer/server.py --host 127.0.0.1 --port 0 --open-browser\nIf that also fails, check Windows network/security restrictions for Python.\n')
    init_db(args.db)
    threading.Thread(target=watchdog,daemon=True).start()
    server.daemon_threads = True
    actual_port = server.server_address[1]
    url = f'http://localhost:{actual_port}'
    print(f'A Little Closer is running: {url}',flush=True)
    print('Keep this window open. Ctrl+C stops the server. Rooms are saved locally.',flush=True)
    if args.open_browser:
        threading.Timer(0.7, lambda: webbrowser.open(url)).start()
    try: server.serve_forever()
    except KeyboardInterrupt: server.server_close()

if __name__ == '__main__': main()
