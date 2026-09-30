"""Optional real-browser smoke test. Uses installed Chrome/Edge and Python stdlib.

Run directly: py -3 test_browser.py. Only an in-memory database is used.
"""
import base64
import json
import os
from pathlib import Path
import shutil
import socket
import struct
import subprocess
import tempfile
import threading
import time
import urllib.request
from urllib.parse import urlparse

import server as game
import adventures


class DevTools:
    def __init__(self, url):
        u=urlparse(url)
        self.socket=socket.create_connection((u.hostname,u.port),timeout=8)
        key=base64.b64encode(os.urandom(16)).decode()
        self.socket.sendall((f'GET {u.path} HTTP/1.1\r\nHost: {u.netloc}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n').encode())
        response=b''
        while not response.endswith(b'\r\n\r\n'):response+=self.socket.recv(1)
        if b' 101 ' not in response:raise RuntimeError(response.decode())
        self.number=0

    def read(self, size):
        data=b''
        while len(data)<size:
            chunk=self.socket.recv(size-len(data))
            if not chunk:raise ConnectionError('Browser closed the DevTools connection')
            data+=chunk
        return data

    def call(self, method, **params):
        self.number+=1
        data=json.dumps(dict(id=self.number,method=method,params=params)).encode()
        size=len(data)
        header=bytes([0x81,0x80|size]) if size<126 else bytes([0x81,0x80|126])+struct.pack('!H',size)
        mask=os.urandom(4)
        self.socket.sendall(header+mask+bytes(b^mask[i%4] for i,b in enumerate(data)))
        while True:
            first,second=self.read(2);size=second&127
            if size==126:size=struct.unpack('!H',self.read(2))[0]
            elif size==127:size=struct.unpack('!Q',self.read(8))[0]
            mask=self.read(4) if second&128 else None
            data=self.read(size)
            if mask:data=bytes(b^mask[i%4] for i,b in enumerate(data))
            if first&15==8:raise ConnectionError('Browser websocket closed')
            if first&15!=1:continue
            message=json.loads(data)
            if message.get('id')==self.number:
                if 'error' in message:raise RuntimeError(message['error'])
                return message.get('result',{})

    def evaluate(self, expression):
        result=self.call('Runtime.evaluate',expression=expression,returnByValue=True,awaitPromise=True)
        if 'exceptionDetails' in result:raise AssertionError(result['exceptionDetails'])
        return result.get('result',{}).get('value')

    def wait(self, expression, timeout=8):
        deadline=time.monotonic()+timeout
        while time.monotonic()<deadline:
            value=self.evaluate(expression)
            if value:return value
            time.sleep(.05)
        raise AssertionError('Browser condition timed out: '+expression+' '+str(self.evaluate('({url:location.href,errors:window.browserErrors,text:document.body?.innerText.slice(0,800)})')))

    def click(self, selector):
        self.evaluate(f'document.querySelector({json.dumps(selector)}).click()')


def main():
    browser=next((str(p) for p in [
        Path(r'C:\Program Files\Google\Chrome\Application\chrome.exe'),
        Path(r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe')
    ] if p.is_file()),None) or shutil.which('google-chrome') or shutil.which('chromium')
    if not browser:raise SystemExit('Chrome or Edge is required for this optional browser check.')
    game.init_db(':memory:')
    httpd=game.ThreadingHTTPServer(('127.0.0.1',0),game.Handler)
    httpd.daemon_threads=True
    threading.Thread(target=httpd.serve_forever,daemon=True).start()
    threading.Thread(target=game.watchdog,daemon=True).start()
    base=f'http://127.0.0.1:{httpd.server_address[1]}'
    pages=[];process=None
    with tempfile.TemporaryDirectory(prefix='closer-browser-') as profile:
        # Cleanup stays within the exact disposable profile under the temp root.
        assert Path(profile).resolve().parent==Path(tempfile.gettempdir()).resolve()
        try:
            process=subprocess.Popen([browser,'--headless=new','--disable-gpu','--no-first-run',
                '--no-default-browser-check','--disable-extensions','--disable-sync',
                '--disable-background-networking','--remote-debugging-port=0',
                '--user-data-dir='+profile,'about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
                creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            active=Path(profile)/'DevToolsActivePort';deadline=time.monotonic()+15
            while not active.exists():
                if time.monotonic()>deadline:raise RuntimeError('Browser did not start')
                time.sleep(.05)
            port=active.read_text().splitlines()[0]
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/json/version') as response:info=json.load(response)
            control=DevTools(info['webSocketDebuggerUrl'])
            output=Path('artifacts');output.mkdir(exist_ok=True)
            def screenshot(p,name):
                (output/name).write_bytes(base64.b64decode(p.call('Page.captureScreenshot',format='png',captureBeyondViewport=True)['data']))
            def page(width=1280):
                target=control.call('Target.createTarget',url='about:blank')['targetId']
                p=DevTools(f'ws://127.0.0.1:{port}/devtools/page/{target}');pages.append(p)
                p.call('Page.enable');p.call('Runtime.enable')
                p.call('Emulation.setDeviceMetricsOverride',width=width,height=950,deviceScaleFactor=1,mobile=False)
                p.call('Page.addScriptToEvaluateOnNewDocument',source="window.browserErrors=[];window.addEventListener('error',e=>browserErrors.push(e.message));window.addEventListener('unhandledrejection',e=>browserErrors.push(String(e.reason)));window.confirm=()=>true;")
                p.call('Page.navigate',url=base);p.wait("!!document.querySelector('#setup-form')")
                return p
            a=page();b=page(390)
            assert b.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Mobile setup overflows'
            assert a.evaluate("[...document.querySelectorAll('[data-avatar]')].every(b=>{const r=document.createRange();r.selectNodeContents(b);const x=r.getBoundingClientRect(),y=b.getBoundingClientRect();return Math.abs(x.left+x.width/2-y.left-y.width/2)<1;})"), 'Avatar centering'
            a.evaluate("document.querySelector('#name').value='Alex';document.querySelector('#city').value='Mexico City, Mexico';document.querySelector('#setup-form button[type=submit]').click()")
            code=a.wait("document.querySelector('#copy-code')?.textContent")
            b.click('#join-tab');b.evaluate(f"document.querySelector('#name').value='Sam';document.querySelector('#city').value='Madrid, Spain';document.querySelector('#room-code').value={json.dumps(code)};document.querySelector('#setup-form button[type=submit]').click()")
            b.wait("!!document.querySelector('#ready')")
            a.wait("document.querySelector('#ready')&&!document.querySelector('#ready').disabled")
            a.click('#ready');b.click('#ready')
            a.wait("!!document.querySelector('#flight-canvas')");b.wait("!!document.querySelector('#fire-pellet')")
            assert not b.evaluate("!!document.querySelector('[data-steer]')"),'Copilot has steering controls'
            assert not a.evaluate("!!document.querySelector('#fire-pellet')"),'Pilot has weapon controls'
            a.click('#launch-flight');a.wait("document.querySelector('#launch-flight').hidden")
            a.call('Page.bringToFront')
            a.evaluate("document.querySelector('#adventure-board').focus()")
            a.call('Input.dispatchKeyEvent',type='keyDown',key='ArrowUp',code='ArrowUp')
            deadline=time.monotonic()+3
            while time.monotonic()<deadline:
                with game.LOCK:moved=game.ROOMS[code]['adventure']['y']<180
                if moved:break
                time.sleep(.05)
            a.call('Input.dispatchKeyEvent',type='keyUp',key='ArrowUp',code='ArrowUp')
            with game.LOCK:assert game.ROOMS[code]['adventure']['y']<200,'Keyboard steering did not move the plane'
            b.click('#flight-shield');b.wait("document.querySelector('#flight-shield').textContent==='Shield active'")
            b.click('#fire-pellet')
            a.click('#pause');b.wait("!!document.querySelector('#ready')")
            a.click('#ready');b.click('#ready');a.wait("!!document.querySelector('#flight-canvas')")
            print('PASS: two browser seats, flight roles, keyboard steering, shields, pause/resume',flush=True)
            def chapter(stage,step=0):
                with game.LOCK:
                    r=game.ROOMS[code];r.update(stage=stage,step=step,phase='playing',paused=False)
                    game.new_puzzle(r);game.save(r)
            chapter(1,1)
            for p in [a,b]:p.wait("!!document.querySelector('.garden-grid')")
            a.click('[data-move=right]');a.wait("document.querySelector('.garden-grid .board-cell:nth-child(23) .pawn')!==null")
            assert b.evaluate('document.documentElement.scrollWidth<=innerWidth'),'Mobile garden overflows'
            screenshot(a,'garden-desktop.png')
            chapter(2,2)
            a.wait("!!document.querySelector('.bridge-grid')");b.wait("!!document.querySelector('#turn-bridge')")
            assert b.evaluate("document.querySelectorAll('.board-cell.lever .lever-icon').length===2"),'Lever SVGs missing'
            assert b.evaluate("[...document.querySelectorAll('.board-cell.lever')].map(e=>e.textContent).join(',')==='A,B'"),'Unexpected lever glyph'
            a.click('[data-move=right]')
            a.wait("document.querySelector('.bridge-grid .board-cell:nth-child(29) .pawn')!==null")
            screenshot(b,'bridge-mobile.png')
            chapter(3)
            for p in [a,b]:p.wait("document.querySelectorAll('[data-star]').length===8")
            a.click('[data-star="0"]');b.click('[data-star="4"]')
            a.wait("document.querySelectorAll('.star-chart svg path').length===1")
            assert b.evaluate('document.documentElement.scrollWidth<=innerWidth'),'Mobile stars overflow'
            screenshot(a,'stars-desktop.png')
            path=adventures.SHAPES[0]['path']
            for edge in range(1,len(path)-1):
                a.click(f'[data-star="{path[edge]}"]');b.click(f'[data-star="{path[edge+1]}"]')
                a.wait(f"document.querySelectorAll('.star-chart svg path').length==={edge+1}")
                b.wait(f"document.querySelectorAll('.star-chart svg path').length==={edge+1}")
            for p in [a,b]:
                p.wait("!!document.querySelector('#continue-stars')")
                assert p.evaluate("document.querySelector('.constellation-reveal h2').textContent==='A kite'"),'Completed shape name missing'
                assert p.evaluate("!!document.querySelector('.completed-threads')"),'Completed drawing missing'
            screenshot(a,'constellation-complete.png')
            a.click('#continue-stars');a.wait("document.querySelector('#continue-stars').disabled")
            assert b.evaluate("!!document.querySelector('.completed-chart')"),'Partner lost completed drawing early'
            b.click('#continue-stars')
            for p in [a,b]:p.wait("document.querySelectorAll('[data-star]').length===8 && document.querySelectorAll('.star-chart svg path').length===0")
            print('PASS: SVG bridge levers and glowing constellation reveal waits for both players',flush=True)
            print('PASS: garden movement, bridge movement, shared constellation thread, mobile layouts',flush=True)
            before=a.evaluate("document.querySelector('#journey .map').getAttribute('viewBox')")
            a.click('#journey [data-zoom=in]')
            assert a.evaluate("document.querySelector('#journey .map').getAttribute('viewBox')")!=before,'Map did not zoom'
            a.click('#journey [data-zoom=fit]')
            a.evaluate("document.querySelector('#journey .map').focus()")
            a.call('Input.dispatchKeyEvent',type='keyDown',key='ArrowLeft',code='ArrowLeft')
            assert a.evaluate("document.querySelector('#journey .map').getAttribute('viewBox')")!=before,'Map did not pan'
            assert a.evaluate("(async()=>{const {journeyMap}=await import('/journey-map.js');return [[{lat:0,lon:179},{lat:0,lon:-179}],[{lat:0,lon:0},{lat:0,lon:0}],[{lat:0,lon:0},{lat:0,lon:180}]].every(pair=>{const host=document.createElement('div');host.innerHTML=journeyMap(pair,0,{});return host.querySelector('svg').getAttribute('viewBox').split(' ').map(Number).every(Number.isFinite)&&!host.innerHTML.includes('NaN')})})()"),'Map coordinate edge case'
            a.call('Page.reload');a.wait("document.querySelectorAll('[data-star]').length===8")
            assert a.evaluate("document.querySelector('#copy-code').textContent")==code,'Refresh lost seat'
            b.call('Page.navigate',url='about:blank')
            a.wait("!!document.querySelector('#ready')",18)
            b.call('Page.navigate',url=base)
            b.wait("!!document.querySelector('#ready')")
            a.click('#ready');b.click('#ready')
            a.wait("document.querySelectorAll('[data-star]').length===8")
            print('PASS: navigating away closes the live connection; both players resume the saved puzzle',flush=True)
            with game.LOCK:
                r=game.ROOMS[code];r.update(phase='victory',stage=3,date='September 30, 2026',discoveries=['A kite','A sailboat','A heart'],constellations=[dict(name=shape['name'],threads=list(zip(shape['path'],shape['path'][1:])),points=adventures.STAR_POINTS) for shape in adventures.SHAPES]);game.save(r)
            a.wait("!!document.querySelector('#download')")
            a.evaluate("window.postcard=null;const original=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(cb,...args){window.postcard={width:this.width,height:this.height,image:this.toDataURL(),pixels:[...this.getContext('2d').getImageData(100,300,1,1).data]};return original.call(this,blob=>{window.postcard.bytes=blob.size;cb(blob)},...args)};HTMLAnchorElement.prototype.click=function(){}")
            a.click('#download');a.wait('window.postcard?.bytes>10000')
            assert a.evaluate('postcard.width===1600&&postcard.height===1100')
            (output/'postcard.png').write_bytes(base64.b64decode(a.evaluate('postcard.image').split(',')[1]))
            a.evaluate("(async()=>{const {drawPostcardMap}=await import('/journey-map.js');const c=document.createElement('canvas');c.width=1600;c.height=1100;const g=c.getContext('2d');g.fillStyle='#193747';g.fillRect(0,0,1600,1100);drawPostcardMap(g,[{city:'Chiapas, Mexico',lat:16.737,lon:-92.637},{city:'Tokyo, Japan',lat:35.681,lon:139.768}]);window.pacificMap=c.toDataURL()})()")
            (output/'pacific-map.png').write_bytes(base64.b64decode(a.evaluate('pacificMap').split(',')[1]))
            print('PASS: map zoom/pan, refresh reconnect, 1600 x 1100 PNG postcard',flush=True)
            practice=page(390);practice.click('#practice-plane');practice.wait("!!document.querySelector('#ready')");practice.click('#ready');practice.wait("!!document.querySelector('#launch-flight')");practice.click('#launch-flight')
            practice.wait("document.querySelector('#launch-flight').hidden")
            assert practice.evaluate("!!document.querySelector('#fire-pellet')"),'Practice combined controls missing'
            practice_code=practice.evaluate("document.querySelector('#copy-code').textContent")
            practice.call('Emulation.setTouchEmulationEnabled',enabled=True,maxTouchPoints=1)
            practice.evaluate("document.querySelector('[data-steer=\"-1\"]').scrollIntoView({block:'center'})")
            touch=practice.evaluate("(()=>{const r=document.querySelector('[data-steer=\"-1\"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,id:0}})()")
            with game.LOCK:old_y=game.ROOMS[practice_code]['adventure']['y']
            practice.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[touch])
            deadline=time.monotonic()+3
            while time.monotonic()<deadline:
                with game.LOCK:moved=game.ROOMS[practice_code]['adventure']['y']<old_y-10
                if moved:break
                time.sleep(.05)
            assert moved,'Touch steering did not move the plane'
            practice.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
            practice.evaluate("window.dispatchEvent(new Event('blur'))")
            time.sleep(.2)
            with game.LOCK:assert game.ROOMS[practice_code]['adventure']['steer']==0,'Touch release/focus loss did not clear steering'
            practice.evaluate('window.scrollTo(0,0)')
            for p in pages:assert p.evaluate('browserErrors')==[],p.evaluate('browserErrors')
            print('PASS: solo practice, touch steering/release, and no browser JavaScript errors',flush=True)
            screenshot(a,'journey-desktop.png');screenshot(practice,'plane-mobile.png')
            control.call('Browser.close')
            process.wait(timeout=10)
        finally:
            for p in pages:p.socket.close()
            if process and process.poll() is None:process.terminate();process.wait(timeout=10)
            httpd.shutdown();httpd.server_close()
            with game.LOCK:game.ROOMS.clear();game.DB.close()


if __name__=='__main__':main()
