"""Generates the original app icon (colored balls in a tube). Run: python3 assets/make_icon.py"""
from PIL import Image, ImageDraw, ImageFilter
S = 1024

def gradient():
    g = Image.new('RGBA', (S, S)); gd = ImageDraw.Draw(g)
    for y in range(S):
        t = y / S
        gd.line([(0, y), (S, y)], fill=(int(43 + 15 * t), int(16 + 107 * t), int(85 + 128 * t), 255))
    return g

def art(pad=0.0):
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    sc = 1 - 2 * pad
    P = lambda v: int(S * pad + v * sc)
    tw, ty0, ty1 = 240, 150, 890
    tx0 = (S - tw) // 2
    tube = Image.new('RGBA', (S, S), (0, 0, 0, 0)); td = ImageDraw.Draw(tube)
    td.rounded_rectangle([P(tx0), P(ty0), P(tx0 + tw), P(ty1)], radius=int(120 * sc),
                         fill=(255, 255, 255, 60), outline=(255, 255, 255, 240), width=max(2, int(16 * sc)))
    im.alpha_composite(tube)
    d.rounded_rectangle([P(tx0 - 36), P(ty0 - 16), P(tx0 + tw + 36), P(ty0 + 16)], radius=int(16 * sc), fill=(255, 255, 255, 245))
    cols = [(46, 204, 113), (255, 214, 10), (47, 128, 255), (255, 59, 92)]
    r = 82
    for k, c in enumerate(cols):
        cy = ty1 - 34 - r - k * (2 * r + 10); cx = S // 2
        ball = Image.new('RGBA', (S, S), (0, 0, 0, 0)); bd = ImageDraw.Draw(ball)
        bd.ellipse([P(cx - r), P(cy - r), P(cx + r), P(cy + r)], fill=c + (255,))
        im.alpha_composite(ball)
        hl = Image.new('RGBA', (S, S), (0, 0, 0, 0)); hd = ImageDraw.Draw(hl)
        hd.ellipse([P(cx - r * 0.6), P(cy - r * 0.62), P(cx - r * 0.12), P(cy - r * 0.22)], fill=(255, 255, 255, 190))
        im.alpha_composite(hl.filter(ImageFilter.GaussianBlur(max(1, int(7 * sc)))))
    return im

def rounded(im, radius):
    m = Image.new('L', (S, S), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, S - 1, S - 1], radius=radius, fill=255)
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0)); out.paste(im, (0, 0), m); return out

if __name__ == '__main__':
    square = gradient(); square.alpha_composite(art(0.08))
    square.save('assets/icon-square.png')                          # full-bleed (Play Store 512 & legacy)
    rounded(square, int(S * 0.22)).save('assets/icon.png')          # web / README
    circ = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    m = Image.new('L', (S, S), 0); ImageDraw.Draw(m).ellipse([0, 0, S - 1, S - 1], fill=255)
    circ.paste(square, (0, 0), m); circ.save('assets/icon-round.png')
    art(0.2).save('assets/icon-foreground.png')                    # adaptive foreground (safe zone)
    square.convert('RGB').resize((512, 512), Image.LANCZOS).save('assets/play-store-icon-512.png')
    rounded(square, int(S * 0.22)).resize((512, 512), Image.LANCZOS).save('www/icon.png')
