import collections
import json
import time
import unittest
from unittest.mock import patch

import adventures
import server as game
import test_game


class AdventureTests(unittest.TestCase):
    def setUp(self):
        test_game.GameTests.setUp(self)
        self.room['edition'] = 2

    tearDown = test_game.GameTests.tearDown
    profile = test_game.GameTests.profile
    action = test_game.GameTests.action
    start = test_game.GameTests.start

    def chapter(self, stage, step=0):
        self.room.update(phase='playing', paused=False, stage=stage, step=step)
        game.new_puzzle(self.room)

    def fly(self):
        r=self.room
        step=r['step']
        pilot=step%2
        self.action(pilot,'launch')
        base=time.time()
        for frame in range(2400):
            now=base+frame*.1
            with patch.object(game.time,'time',return_value=now):
                for p in r['players']: game.SEEN[p['id']]=now
                a=r['adventure']
                if not a['running']: self.action(pilot,'launch')
                next_stamp=next((s for s in a['stamps'] if not s['got'] and s['x']>a['x']-25),None)
                target=next_stamp['y'] if next_stamp else 365
                steer=0 if abs(target-a['y'])<10 else (1 if target>a['y'] else -1)
                if frame%4==0: self.action(pilot,'steer',value=steer)
                if frame%3==0: self.action(1-pilot,'fire')
                if any(not o['gone'] and 0<o['x']-a['x']<100 and abs(o['y']-a['y'])<60 for o in a['objects']):
                    self.action(1-pilot,'shield')
                adventures.tick(r,now,game.advance)
            if r['step']!=step or r['phase']!='playing':return
        self.fail('Flight did not finish with cooperative steering and firing')

    def walk_path(self, player, path):
        for target in path:
            pos=self.room['adventure']['positions'][player]
            direction=next(k for k,(dx,dy) in adventures.DIRECTIONS.items() if [pos[0]+dx,pos[1]+dy]==target)
            self.action(player,'move',direction=direction)

    def garden(self):
        paths=[adventures.garden_layout(self.room['step'],i)['path'] for i in range(2)]
        for j in range(1,len(paths[0])):
            for i in range(2):self.walk_path(i,[paths[i][j]])

    def navigate(self, player, target):
        a=self.room['adventure'];layout=adventures.bridge_layout(self.room['step'])
        queue=collections.deque([(a['positions'][player],[])])
        seen=set()
        while queue:
            pos,path=queue.popleft()
            if pos==target:
                self.walk_path(player,path);return
            if tuple(pos) in seen:continue
            seen.add(tuple(pos))
            for dx,dy in adventures.DIRECTIONS.values():
                p=[pos[0]+dx,pos[1]+dy]
                if p not in layout['cells']:continue
                if p==layout['bridge'] and not a['horizontal']:continue
                if any(p==g['cell'] and g['label'] not in a['opened'] and a['positions'][1-player]!=g['plate'] for g in layout['gates']):continue
                queue.append((p,path+[p]))
        self.fail(f'No route to {target}')

    def bridge(self):
        self.navigate(0,[1,1]);self.navigate(1,[4,2])
        if self.room['step']==2:
            self.navigate(1,[4,3]);self.action(1,'turn_bridge')
        if self.room['step']:
            self.navigate(0,[4,5]);self.navigate(1,[7,2])
        self.navigate(0,[8,3]);self.navigate(1,[8,3])

    def stars(self):
        path=adventures.SHAPES[self.room['step']]['path']
        for first,second in zip(path,path[1:]):
            self.assertEqual(game.snapshot(self.room,0)['adventure']['clue'],adventures.STAR_HINTS[second])
            self.assertEqual(game.snapshot(self.room,1)['adventure']['clue'],adventures.STAR_HINTS[first])
            self.action(0,'star',value=first);self.action(1,'star',value=second)
        completed=game.snapshot(self.room,0)['adventure']
        self.assertTrue(completed['complete'])
        self.assertEqual(completed['name'],adventures.SHAPES[self.room['step']]['name'])
        self.assertEqual(len(completed['threads']),len(path)-1)
        self.action(0,'continue_stars');self.action(1,'continue_stars')

    def test_constellation_reveal_waits_for_both_and_survives_restart(self):
        self.chapter(3)
        path=adventures.SHAPES[0]['path']
        for first,second in zip(path,path[1:]):
            self.action(0,'star',value=first);self.action(1,'star',value=second)
        self.assertEqual(self.room['step'],0)
        self.assertEqual(self.room['phase'],'playing')
        with self.assertRaises(ValueError):self.action(0,'retry')
        with self.assertRaises(ValueError):self.action(1,'star',value=0)
        game.DB.close();game.init_db(self.db)
        self.room=game.ROOMS[self.a['code']]
        self.assertTrue(self.room['paused'])
        for i in range(2):
            s=game.snapshot(self.room,i)['adventure']
            self.assertTrue(s['complete'])
            self.assertNotIn('clue',s)
            self.assertEqual(len(s['threads']),len(path)-1)
        self.start()
        self.action(0,'continue_stars')
        self.action(0,'continue_stars')
        self.assertEqual(self.room['step'],0)
        self.assertEqual(self.room['adventure']['continued'],[True,False])
        self.assertEqual(self.room['discoveries'],['A kite'])
        self.action(1,'continue_stars')
        self.assertEqual(self.room['step'],1)
        self.assertEqual(self.room['adventure']['threads'],[])
        self.assertEqual(len(self.room['constellations']),1)

    def test_entire_revised_journey_is_solvable(self):
        self.start()
        for stage,solver in enumerate([self.fly,self.garden,self.bridge,self.stars]):
            self.assertEqual(self.room['stage'],stage)
            for _ in range(adventures.COUNTS[stage]):solver()
            if stage<3:
                self.assertEqual(self.room['phase'],'checkpoint');self.start()
        self.assertEqual(self.room['phase'],'victory')
        self.assertEqual(self.room['discoveries'],['A kite','A sailboat','A heart'])
        self.assertGreaterEqual(self.room['collected_stamps'],6)

    def test_plane_roles_input_expiry_and_pause(self):
        self.chapter(0)
        with self.assertRaises(ValueError):self.action(1,'launch')
        with self.assertRaises(ValueError):self.action(0,'fire')
        with self.assertRaises(ValueError):self.action(0,'steer',value='up')
        self.action(0,'launch');self.action(0,'steer',value=-1)
        a=self.room['adventure'];start=a['last']
        adventures.tick(self.room,start+.1,game.advance)
        self.assertLess(a['y'],200)
        y=a['y'];adventures.tick(self.room,start+2,game.advance)
        self.assertEqual(a['y'],y)
        self.action(0,'pause');x=a['x']
        self.assertFalse(adventures.tick(self.room,start+100,game.advance))
        self.assertEqual(a['x'],x)
        self.start();self.assertEqual(a['steer'],0)

    def test_plane_collisions_shield_bullets_and_stamp_requirement(self):
        self.chapter(0);self.action(0,'launch')
        a=self.room['adventure'];base=a['last']
        a['objects']=[dict(id='test',x=5,y=200,kind='rock',gone=False)]
        adventures.tick(self.room,base+.1,game.advance)
        self.assertEqual(a['bumps'],1)
        a['immune_until']=0;self.action(1,'shield')
        adventures.tick(self.room,base+.2,game.advance)
        self.assertEqual(a['bumps'],1);self.assertTrue(a['objects'][0]['gone'])
        a['objects']=[dict(id='shot',x=a['x']+80,y=200,kind='rock',gone=False)]
        self.action(1,'fire');self.action(1,'fire')
        self.assertEqual(len(a['bullets']),1)
        adventures.tick(self.room,base+.3,game.advance)
        self.assertTrue(a['objects'][0]['gone'])
        a['x']=a['length'];adventures.tick(self.room,base+.4,game.advance)
        self.assertEqual(self.room['step'],0);self.assertFalse(a['running'])
        self.assertIn('three stamp',self.room['feedback'])

    def test_garden_privacy_gates_and_checkpoint(self):
        self.chapter(1,1)
        a=game.snapshot(self.room,0)['adventure']
        self.assertNotIn('path',a)
        self.assertEqual(a['partner_chart'],adventures.garden_layout(1,1))
        self.walk_path(0,adventures.garden_layout(1,0)['path'][1:7])
        with self.assertRaises(ValueError):self.action(0,'move',direction='right')
        self.action(0,'move',direction='down')
        self.assertEqual(self.room['adventure']['positions'][0],[2,1])
        self.assertTrue(self.room['adventure']['lit'][0])

    def test_bridge_requires_partner_and_lever_latches(self):
        self.chapter(2,2)
        self.navigate(1,[2,3])
        with self.assertRaises(ValueError):self.action(1,'move',direction='right')
        self.navigate(0,[1,1]);self.action(1,'move',direction='right')
        self.navigate(1,[4,2]);self.assertIn('A',self.room['adventure']['opened'])
        self.navigate(0,[1,3]);self.navigate(1,[4,3])
        with self.assertRaises(ValueError):self.action(1,'move',direction='right')
        self.action(1,'turn_bridge');self.action(1,'move',direction='right')
        with self.assertRaises(ValueError):self.action(1,'turn_bridge')

    def test_stars_wrong_guesses_privacy_and_stale_actions(self):
        self.chapter(3)
        self.action(0,'star',value=7)
        other=game.snapshot(self.room,1)['adventure']
        self.assertIsNone(other['selected']);self.assertTrue(other['partner_selected'])
        self.assertNotIn('picks',other);self.assertNotIn('path',other)
        self.action(1,'star',value=7)
        self.assertEqual(self.room['adventure']['threads'],[])
        old=self.room['epoch'];self.action(0,'star',value=0);self.action(1,'star',value=4)
        with self.assertRaises(game.GameError):game.apply(self.room,0,dict(action='star',value=1,epoch=old,id='old-edge'))
        self.assertEqual(self.room['adventure']['threads'],[[0,4]])

    def test_practice_has_bot_and_cannot_earn_full_journey(self):
        session=game.create(self.profile()|{'practice':True})
        r=game.ROOMS[session['code']]
        self.assertTrue(game.online(r['players'][1]))
        game.apply(r,0,dict(action='ready',id='ready'))
        self.assertEqual(r['phase'],'playing')
        game.apply(r,0,dict(action='launch',id='launch',epoch=r['epoch']))
        adventures.tick(r,time.time()+.1,game.advance)
        self.assertTrue(r['adventure']['bullets'])
        game.advance(r)
        self.assertEqual(adventures.view(r,0)['pilot'],0)
        game.advance(r)
        self.assertEqual(r['phase'],'practice_complete')
        self.assertIsNone(r['date'])
        with self.assertRaises(game.GameError):game.join(self.profile()|{'code':r['code']})

    def test_retry_persistence_and_snapshot_credentials(self):
        self.chapter(2,1);self.navigate(0,[1,1]);old=self.room['epoch']
        self.action(1,'retry')
        self.assertEqual(self.room['step'],1)
        self.assertGreater(self.room['epoch'],old)
        self.assertEqual(self.room['adventure']['positions'],[[0,3],[0,4]])
        game.DB.close();game.init_db(self.db)
        r=game.ROOMS[self.a['code']]
        self.assertTrue(r['paused']);self.assertEqual(r['edition'],2)
        serialized=json.dumps(game.snapshot(r,0))
        for p in r['players']:self.assertNotIn(p['token'],serialized)


if __name__=='__main__':unittest.main()
