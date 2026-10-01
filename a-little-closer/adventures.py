"""Second-edition cooperative chapters. State is JSON serializable and server-owned."""
import copy
import math
import time

COUNTS = [2, 3, 3, 3]
DIRECTIONS = {'up': (0, -1), 'down': (0, 1), 'left': (-1, 0), 'right': (1, 0)}
STAR_NAMES = ['Luna', 'Nova', 'Sol', 'Vega', 'Lyra', 'Orion', 'Mira', 'Polaris']
STAR_POINTS = [[150, 40], [350, 40], [70, 145], [250, 145], [430, 145], [150, 255], [350, 255], [250, 335]]
STAR_HINTS = ['the left star in the top row', 'the right star in the top row',
              'the far-left star in the middle row', 'the center star in the middle row',
              'the far-right star in the middle row', 'the left star in the lower pair',
              'the right star in the lower pair', 'the single star at the very bottom']
SHAPES = [dict(name='A kite', path=[0, 4, 6, 2, 0, 3, 7]),
          dict(name='A sailboat', path=[3, 0, 2, 3, 4, 6, 5, 2]),
          dict(name='A heart', path=[3, 0, 2, 5, 7, 6, 4, 1, 3])]


def cell_key(cell):
    return ','.join(map(str, cell))


def garden_layout(step, player):
    # Mirror the second chart vertically: directions must be described, not copied.
    paths = [
        [[0,3],[1,3],[1,2],[2,2],[3,2],[3,3],[4,3],[4,4],[5,4],[6,4],[6,3]],
        [[0,3],[1,3],[1,2],[1,1],[2,1],[2,2],[2,3],[3,3],[4,3],[4,2],[5,2],[5,3],[6,3]],
        [[0,3],[0,2],[1,2],[1,1],[2,1],[2,2],[2,3],[3,3],[4,3],[4,4],[5,4],[5,5],[6,5],[6,4],[6,3]],
    ]
    path = paths[step]
    def mirror(c):
        return [c[0], 6-c[1]] if player else list(c)
    return dict(path=[mirror(c) for c in path],
                switch=mirror([2,1]) if step else None,
                gate=[3,3] if step else None,
                lights=[mirror([1,1]), mirror([5,5])] if step == 2 else [])


def bridge_layout(step):
    cells = [[x,3] for x in range(9)] + [[0,4],[1,4],[1,2],[1,1],[2,1],[2,0],
             [4,2],[4,1],[4,4],[4,5],[3,5],[7,2],[7,1],[7,4],[8,4]]
    gates = [dict(cell=[3,3], plate=[1,1], lever=[4,2], label='A')]
    if step:
        gates.append(dict(cell=[6,3], plate=[4,5], lever=[7,2], label='B'))
    return dict(cells=cells, gates=gates, bridge=[5,3] if step == 2 else None,
                exit=[8,3], width=9, height=7)


def new(r):
    stage, step = r['stage'], r['step']
    if stage == 0:
        objects = []
        for j in range(12):
            objects.append(dict(id=f'o{j}', x=360+j*135,
                                y=[110,270,190,85,310,170][(j+step*2)%6],
                                kind='cloud' if j%3 == 0 else 'rock', gone=False))
        stamps = [dict(id=f's{j}', x=270+j*335, y=[200,100,285,145,235][j], got=False) for j in range(5)]
        r['adventure'] = dict(kind='plane', x=0., y=200., running=False, steer=0,
                              steer_until=0., last=time.time(), shot_at=-100., shield_at=-100.,
                              shield_until=0., immune_until=0., bullets=[], objects=objects,
                              stamps=stamps, bumps=0, length=2050, clock=0.)
    elif stage == 1:
        r['adventure'] = dict(kind='garden', positions=[[0,3],[0,3]], lit=[False,False],
                              collected=[[],[]], visited=[['0,3'],['0,3']], checkpoints=[[0,3],[0,3]])
    elif stage == 2:
        r['adventure'] = dict(kind='bridge', positions=[[0,3],[0,4]], opened=[], horizontal=False)
    else:
        r['adventure'] = dict(kind='stars', edge=0, threads=[], picks={})


def view(r, i):
    a = r['adventure']
    if a['kind'] == 'plane':
        public = {k:copy.deepcopy(a[k]) for k in ['kind','x','y','running','bullets','objects','stamps','bumps','length','clock']}
        public.update(pilot=0 if r.get('practice') else r['step']%2,
                      shield=max(0, a['shield_until']-a['clock']),
                      shield_wait=max(0, 8-(a['clock']-a['shield_at'])),
                      immune=a['clock'] < a['immune_until'])
        return public
    if a['kind'] == 'garden':
        own, partner = garden_layout(r['step'], i), garden_layout(r['step'], 1-i)
        # Own unvisited safe cells are not sent. Only the partner can read that chart.
        return dict(kind='garden', positions=copy.deepcopy(a['positions']), lit=a['lit'][:],
                    collected=copy.deepcopy(a['collected']), visited=a['visited'][i][:],
                    gate=own['gate'], switch=own['switch'], lights=own['lights'],
                    partner_chart=partner, exit=[6,3], width=7, height=7)
    if a['kind'] == 'bridge':
        return copy.deepcopy(a) | bridge_layout(r['step'])
    shape = SHAPES[r['step']]
    edge = a['edge']
    if a.get('complete'):
        return dict(kind='stars', edge=edge, total=len(shape['path'])-1,
                    threads=copy.deepcopy(a['threads']), points=STAR_POINTS,
                    complete=True, name=shape['name'], continued=a['continued'][:])
    target = shape['path'][edge:edge+2]
    # Each person describes their partner's endpoint, never their own answer.
    clue = STAR_HINTS[target[1-i]]
    return dict(kind='stars', edge=edge, total=len(shape['path'])-1, threads=copy.deepcopy(a['threads']),
                points=STAR_POINTS, names=STAR_NAMES, clue=clue,
                selected=a['picks'].get(str(i)), partner_selected=str(1-i) in a['picks'])


def require(condition, message):
    if not condition:
        raise ValueError(message)


def act(r, i, d, advance):
    a, action = r['adventure'], d.get('action')
    if a['kind'] == 'stars' and a.get('complete'):
        require(action == 'continue_stars', 'Enjoy your constellation, then both choose Continue together.')
        a['continued'][i] = True
        if all(a['continued']): advance(r)
        return
    if action == 'retry':
        r['epoch'] += 1
        new(r)
        r['feedback'] = 'Fresh start for this puzzle. Your completed puzzles are safe.'
        return
    if a['kind'] == 'plane':
        pilot = 0 if r.get('practice') else r['step']%2
        if action in ['launch','steer']:
            require(i == pilot, 'Your partner is the pilot for this flight.')
            if action == 'launch':
                a['running'] = True
                a['last'] = time.time()
            else:
                require(type(d.get('value')) is int and d['value'] in [-1,0,1], 'Choose up, down, or neutral.')
                a['steer'] = d['value']
                a['steer_until'] = time.time()+0.7
        elif action in ['fire','shield']:
            require(i != pilot or r.get('practice'), 'Your partner handles pellets and shields for this flight.')
            require(a['running'], 'Wait for the pilot to launch.')
            if action == 'fire':
                fire(a)
            elif a['clock']-a['shield_at'] >= 8:
                a['shield_at'] = a['clock']
                a['shield_until'] = a['clock']+2.8
        else:
            raise ValueError('That control is not available in flight.')
        return
    if a['kind'] in ['garden','bridge']:
        if action == 'turn_bridge' and a['kind'] == 'bridge':
            bridge = bridge_layout(r['step'])['bridge']
            require(bridge is not None and math.dist(a['positions'][i], bridge) <= 1, 'Stand beside the rotating bridge first.')
            require(bridge not in a['positions'], 'Wait until both players are off the rotating bridge.')
            a['horizontal'] = not a['horizontal']
            return
        require(action == 'move' and d.get('direction') in DIRECTIONS, 'Choose a direction to walk.')
        dx, dy = DIRECTIONS[d['direction']]
        pos = a['positions'][i]
        target = [pos[0]+dx,pos[1]+dy]
        if a['kind'] == 'garden':
            layout = garden_layout(r['step'], i)
            require(0 <= target[0] < 7 and 0 <= target[1] < 7, 'That is the edge of the garden.')
            if target not in layout['path']:
                a['positions'][i] = a['checkpoints'][i][:]
                r['feedback'] = 'A patch of thorns! Back to your last lantern. Ask your partner for the next turn.'
                return
            require(target != layout['gate'] or a['lit'][1-i], 'Your partner must light their switch lantern to open this gate.')
            a['positions'][i] = target
            key = cell_key(target)
            if key not in a['visited'][i]: a['visited'][i].append(key)
            if target == layout['switch']:
                a['lit'][i] = True
                a['checkpoints'][i] = target[:]
            if target in layout['lights'] and key not in a['collected'][i]: a['collected'][i].append(key)
            r['feedback'] = ''
            if a['positions'] == [[6,3],[6,3]] and all(len(a['collected'][j]) == len(garden_layout(r['step'], j)['lights']) for j in range(2)):
                advance(r)
            elif target == [6,3] and len(a['collected'][i]) < len(layout['lights']):
                r['feedback'] = 'Find both fireflies on your trail before meeting at the exit.'
        else:
            layout = bridge_layout(r['step'])
            require(target in layout['cells'], 'Water ahead. Find a path across the islands.')
            for gate in layout['gates']:
                require(target != gate['cell'] or gate['label'] in a['opened'] or a['positions'][1-i] == gate['plate'],
                        f"Ask your partner to stand on pressure plate {gate['label']}.")
            require(target != layout['bridge'] or a['horizontal'], 'Turn the nearby bridge to cross from left to right.')
            a['positions'][i] = target
            for gate in layout['gates']:
                if target == gate['lever'] and gate['label'] not in a['opened']:
                    a['opened'].append(gate['label'])
                    r['feedback'] = f"Gate {gate['label']} is now latched open. Your partner can follow."
            if all(p == layout['exit'] for p in a['positions']): advance(r)
        return
    require(action == 'star' and type(d.get('value')) is int and 0 <= d['value'] < len(STAR_NAMES), 'Choose a star on the chart.')
    a['picks'][str(i)] = d['value']
    if len(a['picks']) == 2:
        shape = SHAPES[r['step']]
        target = shape['path'][a['edge']:a['edge']+2]
        if [a['picks']['0'],a['picks']['1']] == target:
            a['threads'].append(target)
            a['edge'] += 1
            a['picks'] = {}
            r['feedback'] = ''
            if a['edge'] == len(shape['path'])-1:
                r.setdefault('discoveries', []).append(shape['name'])
                r.setdefault('constellations', []).append(dict(name=shape['name'], threads=copy.deepcopy(a['threads']), points=STAR_POINTS))
                a.update(complete=True, continued=[False, False])
                r['epoch'] += 1
            else:
                # Reject delayed clicks from the previous edge.
                r['epoch'] += 1
        else:
            a['picks'] = {}
            r['feedback'] = 'Not quite. Describe the row and position of the star on your clue. Finished threads stay.'


def fire(a):
    if a['clock']-a['shot_at'] >= .28:
        a['bullets'].append(dict(x=a['x']+45, y=a['y']))
        a['shot_at'] = a['clock']


def tick(r, now, advance):
    if r['phase'] != 'playing' or r['paused'] or r['stage'] != 0:
        return False
    a = r['adventure']
    if not a['running']: return False
    dt = max(0, min(.15, now-a['last']))
    a['last'] = now
    a['clock'] += dt
    a['x'] += dt*(48 if r['relaxed'] else 66)
    if now < a['steer_until']:
        a['y'] = max(35, min(365, a['y']+a['steer']*dt*180))
    if r.get('practice'):
        fire(a)
        if any(not o['gone'] and 0 < o['x']-a['x'] < 100 and abs(o['y']-a['y']) < 55 for o in a['objects']) and a['clock']-a['shield_at'] >= 8:
            a['shield_at'] = a['clock']
            a['shield_until'] = a['clock']+2.8
    for b in a['bullets']:
        old_x = b['x']
        b['x'] += dt*360
        for o in a['objects']:
            if o['kind'] == 'rock' and not o['gone'] and old_x-22 <= o['x'] <= b['x']+22 and abs(b['y']-o['y']) < 35:
                o['gone'] = True
                b['x'] = -1000
                break
    a['bullets'] = [b for b in a['bullets'] if a['x']-70 < b['x'] < a['x']+700]
    for stamp in a['stamps']:
        if abs(stamp['x']-a['x']) < 35 and abs(stamp['y']-a['y']) < 42:
            stamp['got'] = True
    for o in a['objects']:
        if not o['gone'] and abs(o['x']-a['x']) < 43 and abs(o['y']-a['y']) < (53 if o['kind'] == 'cloud' else 36):
            if a['clock'] < a['shield_until']:
                o['gone'] = True
            elif a['clock'] >= a['immune_until']:
                a['x'] = max(math.floor(a['x']/500)*500, a['x']-100)
                a['immune_until'] = a['clock']+2.2
                a['bumps'] += 1
                r['feedback'] = 'A little turbulence! Your letter is safe. Dodge clouds or ask for a shield.'
                break
    if a['x'] >= a['length']:
        collected = sum(s['got'] for s in a['stamps'])
        if collected >= 3:
            r['collected_stamps'] = r.get('collected_stamps',0)+collected
            advance(r)
        else:
            a.update(x=0., y=200., running=False, steer=0, bullets=[])
            r['feedback'] = f'Your letter needs three stamp seals. You have {collected}; launch another pass to collect the rest. Collected seals stay saved.'
    return dt > 0


def stop(r):
    if r.get('adventure', {}).get('kind') == 'plane':
        r['adventure']['steer'] = 0
        r['adventure']['steer_until'] = 0
        r['adventure']['last'] = time.time()
