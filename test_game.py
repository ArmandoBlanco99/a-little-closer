import concurrent.futures
import http.client
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch, Mock
from urllib.parse import urlencode
import server as game


class GameTests(unittest.TestCase):
    def test_startup_prints_and_opens_actual_bound_url(self):
        httpd = Mock(server_address=('127.0.0.1', 54321))
        with patch('sys.argv', ['server.py', '--auto-port', '--open-browser']), \
             patch.object(game, 'bind_server', return_value=httpd), \
             patch.object(game, 'init_db'), patch.object(game.threading, 'Thread'), \
             patch.object(game.threading, 'Timer') as timer, \
             patch.object(game.webbrowser, 'open') as browser, patch('builtins.print') as output:
            timer.side_effect = lambda delay, callback: Mock(start=callback)
            game.main()
        browser.assert_called_once_with('http://localhost:54321')
        output.assert_any_call('A Little Closer is running: http://localhost:54321', flush=True)
        httpd.serve_forever.assert_called_once()

    def test_port_permission_fallback_and_actual_port(self):
        sentinel = object()
        with patch.object(game, 'ThreadingHTTPServer', side_effect=[PermissionError(13, 'Denied'), sentinel]) as constructor:
            self.assertIs(game.bind_server('127.0.0.1', 8080, True), sentinel)
            self.assertEqual(constructor.call_args_list[1].args[0], ('127.0.0.1', 0))
        with patch.object(game, 'ThreadingHTTPServer', side_effect=PermissionError(13, 'Denied')) as constructor:
            with self.assertRaises(PermissionError): game.bind_server('127.0.0.1', 8080, False)
            self.assertEqual(constructor.call_count, 1)
        httpd = game.bind_server('127.0.0.1', 0)
        try: self.assertGreater(httpd.server_address[1], 0)
        finally: httpd.server_close()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = str(Path(self.tmp.name)/'test.sqlite3')
        game.SEEN.clear()
        game.RATE.clear()
        game.init_db(self.db)
        self.a = game.create(self.profile('Alex','Mexico City',19.4326,-99.1332))
        self.b = game.join(self.profile('Sam','Madrid',40.4168,-3.7038) | {'code':self.a['code']})
        self.room = game.ROOMS[self.a['code']]
        # Regression coverage for saved first-edition rooms.
        self.room.pop('edition', None)
        self.number = 0

    def tearDown(self):
        game.DB.close()
        self.tmp.cleanup()

    def profile(self,name='Tester',city='London',lat=51.5074,lon=-.1278):
        return dict(name=name,city=city,lat=lat,lon=lon,avatar='fox')

    def action(self,i,action,**extra):
        self.number += 1
        return game.apply(self.room,i,dict(action=action,id=str(self.number),epoch=self.room['epoch'],**extra))

    def start(self):
        self.action(0,'ready')
        self.action(1,'ready')

    def test_full_journey_with_private_clues(self):
        self.start()
        self.assertAlmostEqual(self.room['distance'],9065,delta=30)
        for _ in range(2):
            guide=self.room['step']%2
            target=game.snapshot(self.room,guide)['clue']
            self.assertIsNone(game.snapshot(self.room,1-guide)['clue'])
            for value in target:self.action(1-guide,'place',value=value)
            self.action(1-guide,'check')
        self.assertEqual(self.room['phase'],'checkpoint')
        self.start()
        self.assertEqual(self.room['stage'],1)
        for _ in range(6):
            g=self.room['step']%2
            symbol=game.snapshot(self.room,g)['clue']['symbol']
            duration=game.snapshot(self.room,1-g)['clue']['duration']
            self.assertNotIn('duration',game.snapshot(self.room,g)['clue'])
            for i in range(2):self.action(i,'select',value=symbol)
            base=time.time()
            # Heartbeat both controls over real overlap, using a controlled clock.
            for t in range(int(duration/.4)+2):
                with patch.object(game.time,'time',return_value=base+t*.4):
                    if self.room['phase']!='playing' or self.room['step']>_:break
                    self.action(0,'hold')
                    if self.room['phase']=='playing' and self.room['step']==_:self.action(1,'hold')
        self.assertEqual(self.room['phase'],'checkpoint')
        self.start()
        self.assertEqual(self.room['stage'],2)
        for _ in range(2):
            guide=self.room['step']%2
            target=game.snapshot(self.room,guide)['clue']
            for value in target:self.action(1-guide,'place',value=value)
            self.action(1-guide,'check')
        self.assertEqual(self.room['phase'],'checkpoint')
        self.start()
        self.assertEqual(self.room['stage'],3)
        for _ in range(5):
            for_partner0=game.snapshot(self.room,1)['clue']
            for_partner1=game.snapshot(self.room,0)['clue']
            self.action(0,'select',value=for_partner0)
            self.action(1,'select',value=for_partner1)
        self.assertEqual(self.room['phase'],'victory')
        self.assertIsNotNone(self.room['date'])

    def lantern(self):
        self.room.update(phase='playing', stage=1, step=0)
        game.new_puzzle(self.room)
        self.room['secret'] = {'symbol':'Sun', 'duration':2.5}

    def tick(self, now):
        # Run one production watchdog pass without leaving a background thread.
        with patch.object(game.time, 'time', return_value=now), patch.object(game.time, 'sleep', side_effect=[None, InterruptedError]):
            with self.assertRaises(InterruptedError): game.watchdog()

    def test_lantern_toggle_allows_sequential_tabs_for_entire_chapter(self):
        self.lantern()
        base = time.time()
        for step in range(6):
            start = base + step*30
            self.room['secret'] = {'symbol':'Sun', 'duration':2.5}
            with patch.object(game.time, 'time', return_value=start):
                for p in self.room['players']: game.SEEN[p['id']] = start
                for i in range(2): self.action(i, 'select', value='Sun')
                self.action(0, 'latch')
            # First tab stays connected through SSE, with no repeated hold actions.
            with patch.object(game.time, 'time', return_value=start+20):
                for p in self.room['players']: game.SEEN[p['id']] = start+20
                self.assertEqual(game.snapshot(self.room, 0)['latched'], [True, False])
                self.action(1, 'latch')
            self.tick(start+22)
            self.assertEqual(self.room['step'], step)
            version = self.room['version']
            self.tick(start+23)
            self.assertEqual(self.room['step'], step+1)
            self.assertGreater(self.room['version'], version)
            self.assertEqual(self.room['holds'], {})
        self.assertEqual(self.room['phase'], 'checkpoint')

    def test_lantern_toggle_release_change_and_wrong_symbol(self):
        self.lantern()
        with self.assertRaises(game.GameError): self.action(0, 'latch')
        for i in range(2): self.action(i, 'select', value='Sun')
        self.action(0, 'latch')
        self.action(0, 'release')
        self.assertFalse(game.holding(self.room, '0'))
        self.action(0, 'latch')
        self.action(0, 'select', value='Moon')
        self.assertFalse(game.holding(self.room, '0'))
        self.action(0, 'latch')
        self.action(1, 'latch')
        self.tick(time.time()+3)
        self.assertEqual(self.room['step'], 0)
        self.assertEqual(self.room['holds'], {})
        self.assertIn('Different lanterns', self.room['feedback'])

    def test_lantern_toggle_stops_on_pause_disconnect_and_restart(self):
        self.lantern()
        for i in range(2):
            self.action(i, 'select', value='Sun')
            self.action(i, 'latch')
        self.action(0, 'pause')
        self.assertEqual(self.room['holds'], {})
        self.start()
        for i in range(2): self.action(i, 'latch')
        game.SEEN[self.room['players'][0]['id']] = time.time()-10
        self.tick(time.time()+3)
        self.assertTrue(self.room['paused'])
        self.assertEqual(self.room['step'], 0)
        self.assertEqual(self.room['holds'], {})
        game.SEEN[self.room['players'][0]['id']] = time.time()
        self.start()
        self.action(0, 'latch')
        game.DB.close()
        game.init_db(self.db)
        restored = game.ROOMS[self.a['code']]
        self.assertTrue(restored['paused'])
        self.assertEqual(restored['holds'], {})

    def test_lantern_toggle_can_pair_with_manual_hold(self):
        self.lantern()
        for i in range(2): self.action(i, 'select', value='Sun')
        self.action(0, 'latch')
        self.action(1, 'hold')
        self.tick(time.time()+3)
        self.assertEqual(self.room['step'], 0)  # Manual hold expired.
        base = time.time()
        for offset in range(4):
            with patch.object(game.time, 'time', return_value=base+offset):
                self.action(1, 'hold')
        self.assertEqual(self.room['step'], 1)

    def test_wrong_move_does_not_advance_and_guide_cannot_build(self):
        self.start()
        with self.assertRaises(game.GameError):self.action(0,'place',value='Sun')
        self.action(1,'check')
        self.assertEqual(self.room['step'],0)
        self.assertIn('Nearly',self.room['feedback'])

    def test_idempotency_and_stale_puzzle_actions(self):
        self.start()
        d=dict(action='place',id='same-request',epoch=self.room['epoch'],value='Sun')
        game.apply(self.room,1,d)
        game.apply(self.room,1,d)
        self.assertEqual(self.room['placed'],['Sun'])
        with self.assertRaises(game.GameError):game.apply(self.room,1,dict(d,id='old',epoch=-1))

    def test_third_player_and_invalid_credentials_rejected(self):
        with self.assertRaises(game.GameError):game.join(self.profile()|{'code':self.a['code']})
        with self.assertRaises(game.GameError):game.auth(self.a['code'],'fake-token')
        for i in range(2):
            s=game.snapshot(self.room,i)
            self.assertNotIn('secret',s)
            self.assertNotIn('actions',s)
            self.assertNotIn('token',json.dumps(s))

    def test_pause_and_reload_persist_progress(self):
        self.start()
        self.action(1,'place',value='Moon')
        self.action(0,'pause')
        self.assertTrue(self.room['paused'])
        with self.assertRaises(game.GameError):self.action(1,'place',value='Sun')
        self.start()
        self.assertFalse(self.room['paused'])
        game.DB.close()
        game.init_db(self.db)
        restored,_=game.auth(self.a['code'],self.a['token'])
        self.assertEqual(restored['placed'],['Moon'])
        self.assertTrue(restored['paused'])

    def test_offline_partner_and_expiration(self):
        self.start()
        game.SEEN[self.room['players'][0]['id']]=0
        with self.assertRaises(game.GameError):self.action(1,'place',value='Moon')
        self.room['updated']=time.time()-86401
        with self.assertRaises(game.GameError):game.get_room(self.room['code'])

    def test_distance_and_coordinate_validation(self):
        a=dict(lat=0,lon=179);b=dict(lat=0,lon=-179)
        self.assertAlmostEqual(game.distance(a,b),222.39,places=1)
        self.assertEqual(game.distance(a,a),0)
        with self.assertRaises(game.GameError):game.validate_profile(self.profile(lat=float('nan')))
        with self.assertRaises(game.GameError):game.validate_profile(self.profile(lon=181))

    def test_http_sse_and_atomic_join(self):
        httpd=game.ThreadingHTTPServer(('127.0.0.1',0),game.Handler)
        httpd.daemon_threads=True
        threading.Thread(target=httpd.serve_forever,daemon=True).start()
        host,port=httpd.server_address
        def req(path,data=None,token=None):
            con=http.client.HTTPConnection(host,port,timeout=3)
            headers={'Content-Type':'application/json'}
            if token:headers['Authorization']='Bearer '+token
            con.request('POST' if data is not None else 'GET',path,json.dumps(data) if data is not None else None,headers)
            res=con.getresponse();status=res.status;body=res.read();con.close()
            return status,body
        try:
            self.assertEqual(req('/')[0],200)
            self.assertEqual(req('/app.js')[0],200)
            self.assertEqual(req('/../../server.py')[0],404)
            status,body=req('/api/create',self.profile('Host'))
            self.assertEqual(status,200)
            fresh=json.loads(body)
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
                results=list(ex.map(lambda n:req('/api/join',self.profile(n)|{'code':fresh['code']}),['Guest A','Guest B']))
            self.assertEqual(sorted(r[0] for r in results),[200,400])
            self.assertEqual(req('/api/action',{'code':fresh['code'],'action':'ready','id':'1'},'invalid')[0],400)
            con=http.client.HTTPConnection(host,port,timeout=3)
            con.request('GET','/api/events?'+urlencode({'code':fresh['code'],'token':fresh['token']}))
            res=con.getresponse()
            self.assertEqual(res.status,200)
            line=res.readline().decode()
            self.assertTrue(line.startswith('data: '))
            s=json.loads(line[6:])
            self.assertEqual(len(s['players']),2)
            self.assertEqual(s['me'],fresh['player'])
            con.close()
            self.assertEqual(req('/api/events?code=BAD&token=bad')[0],403)
        finally:
            httpd.shutdown();httpd.server_close()


if __name__=='__main__':unittest.main()
