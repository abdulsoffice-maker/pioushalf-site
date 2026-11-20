# Generates public/flowers-light.svg (ivory pages) and public/flowers.svg (navy sections). Original floral art, no figures.
import math, random
T = 420
def petal_flower(cx, cy, r, n, c1, c2, centre, rot=0, op=1.0):
    g = []
    for ring, (scale, col) in enumerate([(1.0, c1), (0.62, c2)]):
        for i in range(n):
            a = rot + (360 / n) * i + (360 / n / 2 if ring else 0)
            pl = r * scale
            g.append(f'<ellipse cx="{cx}" cy="{cy - pl*0.55:.1f}" rx="{pl*0.33:.1f}" ry="{pl*0.55:.1f}" fill="{col}" transform="rotate({a:.1f} {cx} {cy})"/>')
    g.append(f'<circle cx="{cx}" cy="{cy}" r="{r*0.2:.1f}" fill="{centre}"/>')
    g.append(f'<circle cx="{cx}" cy="{cy}" r="{r*0.08:.1f}" fill="#fff" opacity=".7"/>')
    return f'<g opacity="{op}">' + ''.join(g) + '</g>'
def leaf(x, y, l, a, col, op):
    return f'<path d="M{x} {y} q{l*0.25:.1f} {-l*0.32:.1f} {l:.1f} 0 q{-l*0.75:.1f} {l*0.32:.1f} {-l:.1f} 0z" fill="{col}" opacity="{op}" transform="rotate({a} {x} {y})"/>'
def star8(cx, cy, r, col, op):
    pts = []
    for i in range(16):
        rr = r if i % 2 == 0 else r * 0.5
        a = math.radians(i * 22.5 - 90)
        pts.append(f'{cx + rr*math.cos(a):.1f},{cy + rr*math.sin(a):.1f}')
    return f'<polygon points="{" ".join(pts)}" fill="none" stroke="{col}" stroke-width="1.4" opacity="{op}"/>'
def build(pal, path):
    random.seed(7)
    items = [  # x, y, radius, petals, palette index, rot
        (70, 80, 40, 8, 0, 0), (250, 40, 28, 5, 1, 20), (340, 170, 44, 8, 2, 10), (140, 230, 30, 6, 3, 0),
        (40, 330, 36, 5, 1, 36), (230, 330, 46, 8, 0, 22), (380, 380, 26, 5, 3, 0), (330, 40, 18, 6, 2, 0),
        (190, 140, 16, 5, 1, 12), (110, 380, 18, 6, 0, 0)]
    body = []
    def draw(dx, dy):
        out = []
        for (x, y, r, n, k, rot) in items:
            if not (-70 < x+dx < T+70 and -70 < y+dy < T+70): continue
            c1, c2, ce = pal['flowers'][k]
            out.append(petal_flower(x + dx, y + dy, r, n, c1, c2, ce, rot))
            out.append(leaf(x + dx - r*0.9, y + dy + r*0.9, r*0.8, 35 + k*20, pal['leaf'], pal['leafop']))
            out.append(leaf(x + dx + r*0.9, y + dy + r*0.8, r*0.7, -140 - k*10, pal['leaf'], pal['leafop']))
        for (x, y) in [(260, 210), (20, 190), (170, 20), (400, 270), (290, 270), (80, 160)]:
            if not (-20 < x+dx < T+20 and -20 < y+dy < T+20): continue
            out.append(star8(x + dx, y + dy, 9, pal['gold'], pal['goldop']))
        for (x, y) in [(120, 120), (300, 100), (200, 280), (20, 40), (380, 330), (90, 270)]:
            if not (-20 < x+dx < T+20 and -20 < y+dy < T+20): continue
            out.append(f'<circle cx="{x+dx}" cy="{y+dy}" r="2.4" fill="{pal["gold"]}" opacity="{pal["goldop"]}"/>')
        return ''.join(out)
    for dx in (-T, 0, T):
        for dy in (-T, 0, T):
            body.append(draw(dx, dy))
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{T}" height="{T}" viewBox="0 0 {T} {T}">{"".join(body)}</svg>'
    open(path, 'w').write(svg)
light = dict(
    flowers=[('#E9A3B1', '#F6CBD2', '#D4AF37'), ('#F2B88F', '#F9DCC4', '#C98A2B'), ('#B7A3DA', '#DCD1EE', '#D4AF37'), ('#9EC6E6', '#D3E6F4', '#D4AF37')],
    leaf='#58A07F', leafop=.55, gold='#C9A227', goldop=.6)
dark = dict(
    flowers=[('#E9A3B1', '#F6CBD2', '#D4AF37'), ('#F2B88F', '#F9DCC4', '#D4AF37'), ('#B7A3DA', '#DCD1EE', '#D4AF37'), ('#9EC6E6', '#D3E6F4', '#D4AF37')],
    leaf='#58A07F', leafop=.8, gold='#D4AF37', goldop=.8)
build(light, 'public/flowers-light.svg')
build(dark, 'public/flowers.svg')
