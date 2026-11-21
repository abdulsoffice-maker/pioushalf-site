# Generates public/flowers-light.svg: an original, multicolour floral wallpaper (roses, tulips, daisies, blossoms,
# lavender, forget-me-nots) drawn with gradients so it reads as real flowers. No people, no animals.
import math
T = 560
defs = []
def grad(i, c1, c2, c3=None):
    stops = f'<stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/>' if not c3 else f'<stop offset="0" stop-color="{c1}"/><stop offset=".6" stop-color="{c2}"/><stop offset="1" stop-color="{c3}"/>'
    defs.append(f'<radialGradient id="{i}" cx=".5" cy=".4" r=".7">{stops}</radialGradient>')
grad('rr', '#FF7A8A', '#D81E3C', '#8F0F2A'); grad('rp', '#FFD0DC', '#F27AA0', '#C23B6B'); grad('ry', '#FFF3A6', '#F7C531', '#C98F0A')
grad('ro', '#FFD7A8', '#FF9340', '#D9560F'); grad('rv', '#E5D4FF', '#A57BE0', '#6A3FB3'); grad('rb', '#D8EEFF', '#7FB7F0', '#3A7BC8')
grad('rw', '#FFFFFF', '#FFF1F4', '#F2C7D2'); grad('cen', '#FFE27A', '#F2A81D', '#9B5A06'); grad('lf', '#7FC79A', '#3F9B66', '#1F6B45')
def leaf(x, y, l, a, op=.95):
    return f'<path d="M{x} {y} C{x+l*.3:.1f} {y-l*.38:.1f} {x+l*.8:.1f} {y-l*.3:.1f} {x+l:.1f} {y} C{x+l*.8:.1f} {y+l*.3:.1f} {x+l*.3:.1f} {y+l*.38:.1f} {x} {y}Z" fill="url(#lf)" opacity="{op}" transform="rotate({a} {x} {y})"/><path d="M{x} {y} L{x+l*.92:.1f} {y}" stroke="#1F6B45" stroke-opacity=".35" stroke-width=".8" transform="rotate({a} {x} {y})"/>'
def scallop(cx, cy, R, n, amp, rot):
    pts = []
    for k in range(120):
        t = k / 120 * 2 * math.pi
        r = R * (1 + amp * math.cos(n * t + rot))
        pts.append(f'{cx + r*math.cos(t):.1f},{cy + r*math.sin(t):.1f}')
    return 'M' + ' L'.join(pts) + 'Z'
def rose(cx, cy, r, g):
    o = []
    for k, (f, n, amp) in enumerate([(1.0, 7, .1), (.82, 6, .1), (.66, 5, .1), (.5, 5, .12), (.36, 4, .14), (.22, 3, .18)]):
        o.append(f'<path d="{scallop(cx, cy, r*f, n, amp, k*0.9)}" fill="url(#{g})" stroke="#000" stroke-opacity="{0.16 + k*0.04:.2f}" stroke-width="1"/>')
        o.append(f'<path d="{scallop(cx - r*f*.06, cy - r*f*.08, r*f*.82, n, amp, k*0.9 + .5)}" fill="#fff" opacity=".12"/>')
    o.append(f'<path d="M{cx} {cy} m-{r*.1:.1f} 0 a{r*.1:.1f} {r*.1:.1f} 0 1 1 {r*.2:.1f} 0 a{r*.2:.1f} {r*.2:.1f} 0 1 1 {-r*.4:.1f} 0" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="1.1"/>')
    return ''.join(o)
def daisy(cx, cy, r, g='rw'):
    o = []
    for i in range(18):
        a = i * 20
        o.append(f'<ellipse cx="{cx}" cy="{cy - r*.62:.1f}" rx="{r*.13:.1f}" ry="{r*.4:.1f}" fill="url(#{g})" stroke="#E7A7B8" stroke-opacity=".55" stroke-width=".7" transform="rotate({a} {cx} {cy})"/>')
    o.append(f'<circle cx="{cx}" cy="{cy}" r="{r*.26:.1f}" fill="url(#cen)"/>')
    for i in range(9):
        a = i * 40; o.append(f'<circle cx="{cx + r*.12*math.cos(math.radians(a)):.1f}" cy="{cy + r*.12*math.sin(math.radians(a)):.1f}" r="1.1" fill="#7A4306" opacity=".6"/>')
    return ''.join(o)
def blossom(cx, cy, r, g):
    o = []
    for i in range(5):
        a = i * 72
        o.append(f'<path d="M{cx} {cy} C{cx-r*.55:.1f} {cy-r*.35:.1f} {cx-r*.5:.1f} {cy-r*1.0:.1f} {cx-r*.12:.1f} {cy-r:.1f} L{cx} {cy-r*.86:.1f} L{cx+r*.12:.1f} {cy-r:.1f} C{cx+r*.5:.1f} {cy-r*1.0:.1f} {cx+r*.55:.1f} {cy-r*.35:.1f} {cx} {cy}Z" fill="url(#{g})" stroke="#000" stroke-opacity=".12" stroke-width=".7" transform="rotate({a} {cx} {cy})"/>')
    for i in range(8):
        a = math.radians(i * 45); x2, y2 = cx + r*.34*math.cos(a), cy + r*.34*math.sin(a)
        o.append(f'<line x1="{cx}" y1="{cy}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="#B83B64" stroke-width=".9" opacity=".8"/><circle cx="{x2:.1f}" cy="{y2:.1f}" r="1.5" fill="#F2B01E"/>')
    return ''.join(o)
def forget(cx, cy, r):
    o = [f'<circle cx="{cx + r*.62*math.cos(math.radians(i*72-90)):.1f}" cy="{cy + r*.62*math.sin(math.radians(i*72-90)):.1f}" r="{r*.46:.1f}" fill="url(#rb)" stroke="#2F6FB5" stroke-opacity=".3" stroke-width=".7"/>' for i in range(5)]
    o.append(f'<circle cx="{cx}" cy="{cy}" r="{r*.22:.1f}" fill="url(#ry)"/>')
    return ''.join(o)
def tulip(cx, cy, r, g):
    h = r * 1.5
    o = [f'<path d="M{cx} {cy+h*.9:.1f} L{cx} {cy+h*.2:.1f}" stroke="#2F8B5B" stroke-width="3" stroke-linecap="round"/>', leaf(cx, cy + h*.85, r*1.3, -50), leaf(cx, cy + h*.75, r*1.2, -130)]
    o.append(f'<path d="M{cx-r*.7:.1f} {cy-h*.25:.1f} C{cx-r*.75:.1f} {cy+h*.35:.1f} {cx-r*.2:.1f} {cy+h*.45:.1f} {cx} {cy+h*.45:.1f} C{cx+r*.2:.1f} {cy+h*.45:.1f} {cx+r*.75:.1f} {cy+h*.35:.1f} {cx+r*.7:.1f} {cy-h*.25:.1f} L{cx+r*.38:.1f} {cy-h*.02:.1f} L{cx} {cy-h*.45:.1f} L{cx-r*.38:.1f} {cy-h*.02:.1f}Z" fill="url(#{g})" stroke="#000" stroke-opacity=".15" stroke-width=".9"/>')
    o.append(f'<path d="M{cx} {cy-h*.45:.1f} C{cx-r*.28:.1f} {cy} {cx-r*.2:.1f} {cy+h*.3:.1f} {cx} {cy+h*.45:.1f} C{cx+r*.2:.1f} {cy+h*.3:.1f} {cx+r*.28:.1f} {cy} {cx} {cy-h*.45:.1f}Z" fill="#fff" opacity=".18"/>')
    return ''.join(o)
def lavender(cx, cy, h, a):
    o = [f'<path d="M{cx} {cy} q{h*.04:.1f} {-h*.5:.1f} 0 {-h:.1f}" stroke="#4F9A6C" stroke-width="2" fill="none" transform="rotate({a} {cx} {cy})"/>']
    for i in range(9):
        y = cy - h * (0.35 + i * 0.07)
        for s in (-1, 1):
            o.append(f'<ellipse cx="{cx + s*5}" cy="{y:.1f}" rx="3.6" ry="6" fill="url(#rv)" stroke="#6A3FB3" stroke-opacity=".3" stroke-width=".6" transform="rotate({a + s*20} {cx} {cy})"/>')
    return ''.join(o)
def star(cx, cy, r):
    p = []
    for i in range(16):
        rr = r if i % 2 == 0 else r * .5; a = math.radians(i * 22.5 - 90); p.append(f'{cx+rr*math.cos(a):.1f},{cy+rr*math.sin(a):.1f}')
    return f'<polygon points="{" ".join(p)}" fill="none" stroke="#C9A227" stroke-width="1.2" opacity=".65"/>'
# (kind, x, y, size, gradient/angle)
els = [('leaf', 120, 150, 70, 20), ('rose', 110, 130, 50, 'rr'), ('daisy', 330, 70, 36, 'rw'), ('blossom', 470, 160, 40, 'rp'),
       ('tulip', 250, 250, 30, 'ro'), ('forget', 60, 300, 20, 0), ('rose', 400, 330, 46, 'rp'), ('lav', 170, 470, 90, -10),
       ('daisy', 60, 470, 30, 'rw'), ('rose', 300, 470, 40, 'ry'), ('blossom', 510, 450, 34, 'rv'), ('forget', 220, 40, 16, 0),
       ('tulip', 470, 40, 24, 'rr'), ('forget', 420, 220, 15, 0), ('star', 200, 350, 9, 0), ('star', 40, 40, 8, 0), ('star', 350, 190, 8, 0), ('star', 530, 330, 9, 0), ('star', 140, 270, 7, 0), ('star', 460, 520, 8, 0)]
def one(e, dx, dy):
    k, x, y, s, g = e; x += dx; y += dy
    if k == 'rose': return leaf(x - s*.9, y + s*.7, s*.9, 150) + leaf(x + s*.9, y + s*.6, s*.9, 30) + rose(x, y, s, g)
    if k == 'daisy': return leaf(x + s*.7, y + s*.6, s*.8, 40) + daisy(x, y, s, g)
    if k == 'blossom': return blossom(x, y, s, g)
    if k == 'tulip': return tulip(x, y, s, g)
    if k == 'forget': return forget(x, y, s)
    if k == 'lav': return lavender(x, y, s, g)
    if k == 'leaf': return leaf(x, y, s, g)
    if k == 'star': return star(x, y, s)
body = []
for dx in (-T, 0, T):
    for dy in (-T, 0, T):
        for e in els:
            ext = 120 if e[0] != 'star' else 20
            if -ext < e[1] + dx < T + ext and -ext < e[2] + dy < T + ext: body.append(one(e, dx, dy))
svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{T}" height="{T}" viewBox="0 0 {T} {T}"><defs>{"".join(defs)}</defs>{"".join(body)}</svg>'
open('public/flowers-light.svg', 'w').write(svg)
print(len(svg))
