"""Henter ut fjord, innsjøer og elver fra et referansebilde av området (1094 x 836 px).
Vann er lyseblått i bildet. Resultatet lagres i tools/geo.json i samme koordinatsystem
som kartgeneratoren bruker.
Kjør: python3 tools/extract-water.py <referansebilde.png> [tools/geo.json]
"""
import sys, json, warnings
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
from skimage.morphology import disk, skeletonize
from skimage.measure import find_contours, approximate_polygon, label, regionprops

warnings.filterwarnings('ignore')
src = sys.argv[1]
im = np.array(Image.open(src).convert('RGB')).astype(int)
H, W = im.shape[:2]
r, g, b = im[..., 0], im[..., 1], im[..., 2]
water = (b - r > 55) & (g > 185) & (b > 215)

dil = lambda m, k: ndi.binary_dilation(m, disk(k))
ero = lambda m, k: ndi.binary_erosion(m, disk(k), border_value=1)

# Grove ruter for elvene (manuell sporing). Brukes bare til å finne elvevannet.
ROUTES = {
    'Nidelva': [[395, 186], [384, 212], [412, 232], [420, 272], [414, 300], [420, 330], [415, 360], [424, 398], [452, 442], [482, 500], [514, 560], [524, 640], [546, 720], [560, 760], [572, 846]],
    'Gaula': [[100, 630], [124, 680], [146, 712], [166, 748], [178, 790], [186, 846]],
}
# Nidelva rundt Midtbyen (Bakklandet og Kanalen), slått sammen med Nidelva
# Koblinger som er skjult under tekst i referansebildet (Skansen: Kanalen og Nidelva møter fjorden)
FORCE = {'Nidelva': [[[386, 206], [389, 190], [390, 184]], [[408, 186], [398, 186], [390, 184]]]}
EXTRA = {'Nidelva': [[[442, 228], [446, 205], [440, 182], [410, 175], [392, 186]], [[452, 182], [458, 170], [466, 150], [474, 126]]]}

def route_mask(route, width):
    img = Image.new('L', (W, H), 0)
    ImageDraw.Draw(img).line([tuple(p) for p in route], fill=255, width=width * 2, joint='curve')
    return np.array(img) > 0

# --- hav (fjord og Gaulosen): brede flater som treffer bildekanten ---
wide = ndi.binary_opening(water, disk(3))
lab = label(wide, connectivity=2)
sea = np.zeros_like(water)
for reg in regionprops(lab):
    minr, minc, maxr, maxc = reg.bbox
    if (minr == 0 or minc == 0 or maxr == H or maxc == W) and reg.area > 3000:
        sea |= ndi.binary_fill_holes(lab == reg.label)

# --- elver: alt vann nær ruta som ikke er hav ---
rivers_out = []
river_all = np.zeros_like(water)
mouths = []
for name, route in ROUTES.items():
    near = route_mask(route, 30)
    for extra in EXTRA.get(name, []): near |= route_mask(extra, 16)
    rm = water & near & ~sea
    rm = ndi.binary_closing(rm, disk(2))
    # koble sammen bitene (veier og tekst bryter elva i referansebildet)
    comps = label(rm, connectivity=2)
    regs = sorted(regionprops(comps), key=lambda rg: -rg.area)
    regs = [rg for rg in regs if rg.area >= 6]
    def along(rg):
        cy, cx = rg.centroid
        best, acc, pos = 1e9, 0, 0
        for i in range(1, len(route)):
            a, bb = np.array(route[i - 1], float), np.array(route[i], float)
            d = bb - a; L = np.hypot(*d); t = np.clip(np.dot(np.array([cx, cy]) - a, d) / (L * L), 0, 1)
            dd = np.hypot(*(a + t * d - [cx, cy]))
            if dd < best: best, pos = dd, acc + t * L
            acc += L
        return pos
    regs.sort(key=along)
    img = Image.fromarray(rm.astype(np.uint8) * 255)
    dr = ImageDraw.Draw(img)
    for r1, r2 in zip(regs, regs[1:]):
        p1 = np.argwhere(comps == r1.label); p2 = np.argwhere(comps == r2.label)
        d, idx = cKDTree(p2).query(p1)
        i = int(np.argmin(d)); a = p1[i]; bpt = p2[idx[i]]
        if d[i] < 60:
            dr.line([(int(a[1]), int(a[0])), (int(bpt[1]), int(bpt[0]))], fill=255, width=4)
    rm = np.array(img) > 0
    # koble elva til havet der den munner ut (overgangen kan være dekket av tekst/skilt)
    sea_pts = np.argwhere(ero(sea, 0) if False else sea)
    rv_pts = np.argwhere(rm)
    d, idx = cKDTree(sea_pts).query(rv_pts)
    i = int(np.argmin(d))
    if 1 < d[i] < 40:
        a, bpt = rv_pts[i], sea_pts[idx[i]]
        img = Image.fromarray(rm.astype(np.uint8) * 255)
        ImageDraw.Draw(img).line([(int(a[1]), int(a[0])), (int(bpt[1]), int(bpt[0]))], fill=255, width=5)
        rm = np.array(img) > 0
    img = Image.fromarray(rm.astype(np.uint8) * 255); dr = ImageDraw.Draw(img)
    for line in FORCE.get(name, []): dr.line([tuple(p) for p in line], fill=255, width=6, joint='curve')
    rm = np.array(img) > 0
    from skimage.morphology import remove_small_holes
    rm = remove_small_holes(rm, 60)
    # minste bredde ca. 5 px langs senterlinja, så elva alltid synes
    sk = skeletonize(rm)
    rm = rm | dil(sk, 2)
    # forleng elva noen piksler inn i havet så den smelter sammen med fjorden
    touch = dil(rm, 4) & sea
    if touch.any():
        for reg in regionprops(label(dil(rm, 1) & sea, connectivity=2)):
            cy, cx = reg.centroid
            mouths.append([round(float(cx), 1), round(float(cy), 1)])
    rm = rm | touch
    rm = ndi.gaussian_filter(rm.astype(float), 0.7) > 0.45
    river_all |= rm
    rivers_out.append({'name': name, 'mask': rm})

def contour_polys(mask, pad=24, tol=0.8, min_area=10, smooth=0.8):
    """Konturer av en maske. Bildekanten utvides så polygoner som treffer kanten fortsetter utenfor."""
    m = np.pad(np.pad(mask, pad, mode='edge'), 1, mode='constant').astype(float)
    m = ndi.gaussian_filter(m, smooth)
    polys = []
    for c in find_contours(m, 0.5):
        c = approximate_polygon(c, tol)
        pts = [[round(float(x) - pad - 1, 1), round(float(y) - pad - 1, 1)] for y, x in c]
        a = 0.5 * abs(sum(pts[i][0] * pts[i - 1][1] - pts[i - 1][0] * pts[i][1] for i in range(len(pts))))
        if a >= min_area and len(pts) >= 4:
            polys.append(pts)
    return polys

# --- innsjøer: alt annet vann som ikke er hav eller elv ---
lakes_mask = ndi.binary_opening(water, disk(1)) & ~sea & ~dil(river_all, 2)
lakes_mask = ndi.binary_fill_holes(ndi.binary_closing(lakes_mask, disk(2)))
lakes = []
llab = label(lakes_mask, connectivity=2)
for reg in regionprops(llab):
    if reg.area < 14: continue
    for pts in contour_polys(llab == reg.label, min_area=12):
        lakes.append(pts)

seas = contour_polys(sea, min_area=500, smooth=1.0)
rivers = []
for rv in rivers_out:
    polys = contour_polys(rv['mask'], tol=0.6, min_area=20, smooth=0.6)
    rivers.append({'name': rv['name'], 'polys': polys})

out = sys.argv[2] if len(sys.argv) > 2 else 'tools/geo.json'
json.dump({'seas': seas, 'lakes': lakes, 'rivers': rivers, 'mouths': mouths}, open(out, 'w'))
print(f"hav: {len(seas)}, innsjøer: {len(lakes)}, elver: {[(r['name'], len(r['polys'])) for r in rivers]}, munninger: {mouths}")
