#!/usr/bin/env python3
"""由 src/app/shelf/spine/design/*.svg 生成 src/app/shelf/spine/art.tsx。

设计稿是 Illustrator 导出的书脊：画板就是书脊的实际尺寸（27.3 × 145，一枚中等
厚度的书脊），所以生成出来的组件按原坐标内联，靠 viewBox 把几何按两轴等比映射
到 app 里的书脊尺寸上。三件事脚本替我们做掉：

  1. 丢掉 <text> 与它那套 class（书名/作者是动态的，字号得按书脊厚度推，
     交给 shared.tsx 那套组件；这里只留下「第一个字基线在哪、多大、什么颜色」）；
  2. 把 class 里的 fill/opacity 摊平成元素属性（内联 <style> 会漏到全站）；
  3. 拆成 art / shade 两层：柱面光影在设计稿里压在文字之上，文字层要夹在中间。

设计师改了稿子：替换 design/*.svg 再跑一次本脚本，别手改 art.tsx。

    python3 scripts/build-spine-art.py
"""
import base64
import json
import os
import re
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESIGN_DIR = os.path.join(ROOT, 'src/app/shelf/spine/design')
ASSET_DIR = os.path.join(ROOT, 'src/app/shelf/spine/design-assets')
OUT_FILE = os.path.join(ROOT, 'src/app/shelf/spine/art.tsx')

XLINK_NS = 'http://www.w3.org/1999/xlink'

# 顺序 = 模版清单里书脊样式的排布顺序（设计文档 §13.4）：按布面的感知亮度从深到浅，
# 亮度由 AI 稿子栅格化后量出来（去掉稿子里的样字，只看布面）。经典压印在
# spineTemplates.tsx 里排在最前面，它的布面量下来是 23–27，本来就是最深的一套。
# 改顺序 = 改这张表 + 跑一次脚本 + 同步 templatesArt.tsx 里的清单。
DESIGNS = [
    ('matte', 'matte.svg'),        # 32.7  哑光黑
    ('contour', 'contour.svg'),    # 33.2  等高线
    ('indigo', 'indigo.svg'),      # 36.4  靛蓝烫银
    ('bauhaus', 'bauhaus.svg'),    # 37.0  包豪斯
    ('navy', 'navy.svg'),          # 37.7  藏青
    ('leather', 'leather.svg'),    # 38.6  皮革烫金
    ('goldgreen', 'goldgreen.svg'),  # 38.8  墨绿烫金
    ('pine', 'pine.svg'),          # 40.7  松林
    ('deep', 'deep.svg'),          # 40.8  深海
    ('aura', 'aura.svg'),          # 41.3  晕染
    ('ash', 'ash.svg'),            # 41.6  灰烬
    ('slate', 'slate.svg'),        # 51.2  板岩
    ('dusk', 'dusk.svg'),          # 52.1  暮色
    ('clay', 'clay.svg'),          # 61.8  陶土
    ('amber', 'amber.svg'),        # 65.3  琥珀
    ('sage', 'sage.svg'),          # 68.3  苔绿
    ('stone', 'stone.svg'),        # 79.4  素石
]

ATTR_MAP = {
    'stroke-width': 'strokeWidth',
    'stroke-linecap': 'strokeLinecap',
    'stroke-linejoin': 'strokeLinejoin',
    'stroke-miterlimit': 'strokeMiterlimit',
    'stroke-dasharray': 'strokeDasharray',
    'stroke-opacity': 'strokeOpacity',
    'fill-opacity': 'fillOpacity',
    'fill-rule': 'fillRule',
    'clip-rule': 'clipRule',
    'clip-path': 'clipPath',
    'stop-color': 'stopColor',
    'stop-opacity': 'stopOpacity',
}

# CSS 声明 → SVG 属性。isolation 这类只管堆叠上下文，摊平后没意义，丢掉。
DECL_MAP = {
    'fill': 'fill',
    'opacity': 'opacity',
    'stroke': 'stroke',
    'stroke-width': 'strokeWidth',
    'stroke-linecap': 'strokeLinecap',
    'stroke-linejoin': 'strokeLinejoin',
    'stroke-dasharray': 'strokeDasharray',
    'display': 'display',
}

DEF_TAGS = {'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'filter', 'pattern'}


def local(tag):
    return tag.split('}')[-1]


def parse_decls(text):
    out = {}
    for chunk in (text or '').split(';'):
        if ':' not in chunk:
            continue
        prop, _, value = chunk.partition(':')
        out[prop.strip()] = value.strip()
    return out


def parse_styles(text):
    classes = {}
    for match in re.finditer(r'([^{}]+)\{([^{}]*)\}', text or ''):
        decls = parse_decls(match.group(2))
        for selector in match.group(1).split(','):
            selector = selector.strip()
            if selector.startswith('.'):
                classes.setdefault(selector[1:], {}).update(decls)
    return classes


def collect_styles(root):
    for el in root.iter():
        if local(el.tag) == 'style':
            return parse_styles(el.text)
    return {}


def decls_of(el, styles):
    decls = dict(styles.get(el.get('class'), {}))
    if el.get('style'):
        decls.update(parse_decls(el.get('style')))
    return decls


def transform_of(el):
    """translate(x y) → (x, y)；别的变换（scale 之类）返回 None。"""
    transform = (el.get('transform') or '').strip()
    match = re.fullmatch(r'translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*\)', transform)
    if not match:
        return None
    return float(match.group(1)), float(match.group(2))


# 文字组里往下继承的演示属性：老稿写在 <text> 上，新稿写在组上
TEXT_INHERITED = ('fill', 'font-family', 'font-size', 'font-weight', 'text-anchor')


def is_text_group(el):
    """书名组 / 作者组：Illustrator 老稿用 data-name，手写新稿用 id。"""
    if local(el.tag) != 'g':
        return False
    return (el.get('data-name') or el.get('id')) in ('title', 'author')


def text_spec(root, styles, section, origin, required=True):
    """把书名/作者那一列字读成「首尾基线 + 字号 + 字距 + 墨色」。

    坐标一律换算成「相对书脊左上角」，模版那边才好按画板的宽高比摆。两种稿子的
    写法都认：老稿（Illustrator）是 <g data-name="title"> 里一串 translate 过的
    <text>，字号写在 class 上；新稿（手写）是 <g id="title">，字用 x/y 定点，
    字号和墨色写在组上、靠继承传下来。

    `required=False` 时找不到组就返回 None —— 设计稿没画作者那一行是常事。
    """
    group = None
    for el in root.iter():
        if is_text_group(el) and (el.get('data-name') or el.get('id')) == section:
            group = el
            break
    if group is None:
        if not required:
            return None
        raise SystemExit(f'设计稿里找不到 data-name="{section}" 的组')

    rows = []
    state = {'size': None, 'ink': None, 'family': None, 'anchor': 'start'}

    def walk(el, inherited):
        merged = dict(inherited)
        for key in TEXT_INHERITED:
            value = el.get(key)
            if value is not None:
                merged[key] = value
        merged.update(decls_of(el, styles))
        if local(el.tag) == 'text':
            pos = transform_of(el)
            if pos is None:
                # 新稿用 x/y 定点，没有 transform
                pos = (float(el.get('x') or 0), float(el.get('y') or 0))
            rows.append(pos)
            if merged.get('font-size'):
                state['size'] = float(re.sub(r'[^\d.]', '', merged['font-size']))
            state['ink'] = merged.get('fill', state['ink'])
            state['family'] = merged.get('font-family', state['family'])
            state['anchor'] = merged.get('text-anchor', state['anchor'])
        for child in el:
            walk(child, merged)

    walk(group, {})
    if not rows:
        raise SystemExit(f'设计稿里 {section} 组里没读到 <text>')
    if not state['size']:
        raise SystemExit(f'设计稿里 {section} 组没读到字号（font-size）')

    size = state['size']
    baselines = [pos[1] for pos in rows]
    first, last = min(baselines), max(baselines)
    # 设计稿里的字距：一列字的基线间距（样稿上通常 4 个字）
    advance = (last - first) / (len(rows) - 1) if len(rows) > 1 else size * 1.1

    # 模版按「字列左边缘 + 半个字号」算字列中心，所以这里把锚点归一到左边缘：
    # 老稿是左对齐（x 就是左边缘），新稿 text-anchor="middle"（x 是中心）。
    across = rows[0][0]
    if state['anchor'] == 'middle':
        across -= size / 2
    elif state['anchor'] == 'end':
        across -= size
    return {
        'firstBaseline': round(first - origin[1], 3),
        'lastBaseline': round(last - origin[1], 3),
        'size': size,
        'advance': round(advance, 3),
        'sampleCount': len(rows),
        'ink': state['ink'],
        'family': state['family'],
        'across': round(across - origin[0], 3),
    }


def spine_rect(root):
    """画板里那块书脊矩形：宽 25–28、高 140–150，宽度最接近 27 的那一个。

    设计师常把「带渐变的那块」画得比书脊大一点点（27.1 对 27），取最接近 27 的
    才正好是书脊本身。
    """
    best = None
    for el in root.iter():
        if local(el.tag) != 'rect':
            continue
        width = float(el.get('width', 0))
        height = float(el.get('height', 0))
        if 25 <= width <= 28 and 140 <= height <= 150:
            candidate = {
                'x': float(el.get('x', 0)),
                'y': float(el.get('y', 0)),
                'width': width,
                'height': height,
                'fill': el.get('fill'),
                'class': el.get('class'),
                'distance': abs(width - 27),
            }
            if best is None or candidate['distance'] < best['distance']:
                best = candidate
    if best is not None:
        best.pop('distance')
        return best
    raise SystemExit('画板里找不到 27 × 145 的书脊矩形')


def base_color(elements, gradients, styles):
    """底色兜底：最先铺满书脊的那块矩形；是渐变就取第一档颜色。"""
    for el in elements:
        if local(el.tag) != 'rect':
            continue
        if float(el.get('width', 0)) < 20 or float(el.get('height', 0)) < 100:
            continue
        fill = el.get('fill') or decls_of(el, styles).get('fill', '')
        if not fill.startswith('url('):
            return fill or '#fff'
        gradient_id = fill[5:-1]
        for gradient in gradients:
            if gradient.get('id') != gradient_id:
                continue
            stop = next((child for child in gradient if local(child.tag) == 'stop'), None)
            if stop is not None:
                return stop.get('stop-color') or decls_of(stop, styles).get('fill') or '#fff'
    return '#fff'


def emit_el(el, styles, ids, indent, asset_names):
    """一个元素摊平成 JSX：class → 属性，url(#id) 跟着改名，href 换成 import 进来的图。"""
    name = local(el.tag)
    attrs = {}

    def rename(value):
        return re.sub(
            r'url\(#([^)]+)\)',
            lambda match: f'url(#{ids.get(match.group(1), match.group(1))})',
            value or '',
        )

    for key in el.keys():
        key_local = local(key) if key.startswith('{') else key
        value = el.get(key)
        if key == f'{{{XLINK_NS}}}href':
            key_local = 'href'
        elif key_local in ('class', 'style', 'data-name'):
            continue
        if key_local == 'id':
            if value in ids:
                attrs['id'] = ids[value]
            continue
        attrs[ATTR_MAP.get(key_local, key_local)] = rename(value)

    decls = decls_of(el, styles)
    for prop, attr in DECL_MAP.items():
        if prop in decls:
            attrs[attr] = rename(decls[prop])

    pad = ' ' * indent
    parts = []
    for key, value in attrs.items():
        if key == 'href' and value in asset_names:
            parts.append(f'{key}={{{asset_names[value]}}}')
        else:
            parts.append(f'{key}="{value}"')
    head = f'{pad}<{name}' + ('' if not parts else ' ' + ' '.join(parts))

    children = [child for child in el if local(child.tag) != 'style']
    if not children:
        return head + ' />'

    lines = [head + '>']
    for child in children:
        lines.append(emit_el(child, styles, ids, indent + 2, asset_names))
    lines.append(f'{pad}</{name}>')
    return '\n'.join(lines)


def is_full_bleed(el, spine, styles):
    """覆盖整条书脊、用的还是渐变的矩形 —— 就是压在文字上的那层光影。"""
    if local(el.tag) != 'rect':
        return False
    width = float(el.get('width', 0))
    height = float(el.get('height', 0))
    fill = el.get('fill') or decls_of(el, styles).get('fill', '')
    if not fill.startswith('url('):
        return False
    return width >= spine['width'] - 1 and height >= spine['height'] - 1


# ---------------------------------------------------------------- 画稿几何
#
# 书名要排在稿子里图案之外的空白区，所以得先知道「图案占了沿长轴的哪几段」。
# 这里按元素类型算包围盒（不牵扯渲染，纯几何），再把满幅的底色/晕染剔掉。

PATH_TOKEN = re.compile(r'([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)')

# 贝塞尔曲线按控制点外框算。真极值不会超出控制点外框，所以对安全区是偏保守的。
CURVE_ARGS = {'M': 2, 'L': 2, 'H': 1, 'V': 1, 'C': 6, 'S': 4, 'Q': 4, 'T': 2, 'A': 7}

# 算图案时跳过的标签：几何定义、给读屏器看的元数据、以及文字（文字是动态排的）
GEOM_SKIP = {
    'defs', 'style', 'title', 'desc', 'text', 'tspan', 'textPath',
    'clipPath', 'mask', 'pattern', 'filter', 'linearGradient', 'radialGradient', 'stop',
    'use', 'symbol', 'marker', 'metadata',
}

# 满幅的矩形/图片算「底」不算「图案」：底色矩形、晕染那两张水彩图都铺满整条书脊，
# 书名压上去不影响认读；圆形、折线、路径这些是设计师摆的图形，一律算图案。
# 沿长那一档放宽到三分之一：晕染的水彩图只铺了不到半条书脊，但显然也是底。
BACKDROP_TAGS = ('rect', 'image')
BACKDROP_ACROSS = 0.95
BACKDROP_ALONG = 0.35

# 自动识别不适用时按模版覆盖：{design_id: [[起, 止], ...]}，设计稿单位、沿长轴
DECOR_OVERRIDES = {}


def path_bbox(d):
    """路径的几何包围盒。作者没画弧线，这条路径也用不上；真遇上 A 只按端点估。"""
    seq = [(cmd, None) if cmd else (None, float(num)) for cmd, num in PATH_TOKEN.findall(d or '')]
    box = None
    pos = (0.0, 0.0)
    sub = (0.0, 0.0)
    cubic = None
    quad = None
    index = 0

    def add(point):
        nonlocal box
        x, y = point
        box = [x, y, x, y] if box is None else [
            min(box[0], x), min(box[1], y), max(box[2], x), max(box[3], y),
        ]

    def read(count):
        nonlocal index
        values = []
        while len(values) < count:
            if index >= len(seq) or seq[index][0] is not None:
                raise SystemExit(f'路径参数不足：{d}')
            values.append(seq[index][1])
            index += 1
        return values

    while index < len(seq):
        kind = seq[index][0]
        if kind is None:
            raise SystemExit(f'路径以参数开头：{d}')
        index += 1
        command = kind.upper()
        relative = kind.islower()
        if command == 'Z':
            pos = sub
            cubic = quad = None
            continue

        first = True
        while index < len(seq) and seq[index][0] is None:
            # M 后面跟多组坐标时，从第二组起是隐式 L
            if command == 'M' and not first:
                command = 'L'
            args = read(CURVE_ARGS[command])
            first = False
            base = pos if relative else (0.0, 0.0)

            def at(x, y):
                return (base[0] + x, base[1] + y)

            if command == 'M':
                pos = sub = at(*args)
                add(pos)
                cubic = quad = None
            elif command == 'L':
                pos = at(*args)
                add(pos)
                cubic = quad = None
            elif command == 'H':
                pos = (base[0] + args[0] if relative else args[0], pos[1])
                add(pos)
                cubic = quad = None
            elif command == 'V':
                pos = (pos[0], base[1] + args[0] if relative else args[0])
                add(pos)
                cubic = quad = None
            elif command == 'C':
                controls = [at(args[0], args[1]), at(args[2], args[3])]
                for point in controls:
                    add(point)
                cubic = controls[1]
                quad = None
                pos = at(args[4], args[5])
                add(pos)
            elif command == 'S':
                mirror = (2 * pos[0] - cubic[0], 2 * pos[1] - cubic[1]) if cubic else pos
                add(mirror)
                controls = [at(args[0], args[1])]
                for point in controls:
                    add(point)
                cubic = controls[0]
                quad = None
                pos = at(args[2], args[3])
                add(pos)
            elif command == 'Q':
                add(at(args[0], args[1]))
                quad = at(args[0], args[1])
                cubic = None
                pos = at(args[2], args[3])
                add(pos)
            elif command == 'T':
                quad = (2 * pos[0] - quad[0], 2 * pos[1] - quad[1]) if quad else pos
                add(quad)
                cubic = None
                pos = at(args[0], args[1])
                add(pos)
            elif command == 'A':
                # 弧线没画过；按端点外扩一个半径当包围盒，宁可保守
                rx, ry = abs(args[0]), abs(args[1])
                pos = at(args[5], args[6])
                add(pos)
                add((pos[0] - rx, pos[1] - ry))
                add((pos[0] + rx, pos[1] + ry))
                cubic = quad = None
    return box


NUMBER = re.compile(r'-?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][-+]?[0-9]+)?')
TRANSFORM_TOKEN = re.compile(r'([a-zA-Z]+)[ \t]*\(([^)]*)\)')


def matrix_multiply(outer, inner):
    """outer · inner：先套 inner 再套 outer，和 SVG 里 transform 列表从左到右一致。"""
    a1, b1, c1, d1, e1, f1 = outer
    a2, b2, c2, d2, e2, f2 = inner
    return (
        a1 * a2 + c1 * b2,
        b1 * a2 + d1 * b2,
        a1 * c2 + c1 * d2,
        b1 * c2 + d1 * d2,
        a1 * e2 + c1 * f2 + e1,
        b1 * e2 + d1 * f2 + f1,
    )


def matrix_of(text):
    """transform 属性 → 仿射矩阵。只认稿子里真用到的几种，其它按不缩放处理。"""
    matrix = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
    for name, args in TRANSFORM_TOKEN.findall(text or ''):
        values = [float(value) for value in NUMBER.findall(args)]
        if name == 'translate':
            step = (1.0, 0.0, 0.0, 1.0, values[0], values[1] if len(values) > 1 else 0.0)
        elif name == 'scale':
            sx = values[0]
            sy = values[1] if len(values) > 1 else sx
            step = (sx, 0.0, 0.0, sy, 0.0, 0.0)
        elif name == 'matrix':
            step = tuple(values[:6])
        else:
            continue
        matrix = matrix_multiply(matrix, step)
    return matrix


def transform_box(box, matrix):
    """包围盒过一遍矩阵：四角取外框（旋转/斜切时偏保守，够用了）。"""
    a, b, c, d, e, f = matrix
    xs, ys = [], []
    for x, y in ((box[0], box[1]), (box[2], box[1]), (box[2], box[3]), (box[0], box[3])):
        xs.append(a * x + c * y + e)
        ys.append(b * x + d * y + f)
    return [min(xs), min(ys), max(xs), max(ys)]


def number(el, key, default=0.0):
    value = el.get(key)
    if value is None or value.strip() == '':
        return default
    return float(value)


def points_bbox(text):
    values = [float(value) for value in re.findall(r'-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?', text or '')]
    xs, ys = values[0::2], values[1::2]
    if not xs or not ys:
        return None
    return [min(xs), min(ys), max(xs), max(ys)]


def union_bbox(boxes):
    boxes = [box for box in boxes if box]
    if not boxes:
        return None
    return [
        min(box[0] for box in boxes),
        min(box[1] for box in boxes),
        max(box[2] for box in boxes),
        max(box[3] for box in boxes),
    ]


def is_backdrop(box, board):
    """满幅的底色/晕染：横跨方向铺满、沿长方向占掉一半以上。"""
    if not box:
        return False
    across = (min(box[2], board[2]) - max(box[0], board[0])) / (board[2] - board[0])
    along = (min(box[3], board[3]) - max(box[1], board[1])) / (board[3] - board[1])
    return across >= BACKDROP_ACROSS and along >= BACKDROP_ALONG


def element_bbox(el, board, matrix=(1.0, 0.0, 0.0, 1.0, 0.0, 0.0)):
    """一个元素的几何包围盒（绝对坐标）。满幅的矩形/图片当底色，不算图案。"""
    tag = local(el.tag)
    if tag in GEOM_SKIP:
        return None
    if el.get('transform'):
        matrix = matrix_multiply(matrix, matrix_of(el.get('transform')))
    if tag == 'g':
        return union_bbox(element_bbox(child, board, matrix) for child in el)

    if tag == 'rect':
        x, y = number(el, 'x'), number(el, 'y')
        box = [x, y, x + number(el, 'width'), y + number(el, 'height')]
    elif tag == 'circle':
        cx, cy, r = number(el, 'cx'), number(el, 'cy'), number(el, 'r')
        box = [cx - r, cy - r, cx + r, cy + r]
    elif tag == 'ellipse':
        cx, cy = number(el, 'cx'), number(el, 'cy')
        rx, ry = number(el, 'rx'), number(el, 'ry')
        box = [cx - rx, cy - ry, cx + rx, cy + ry]
    elif tag == 'line':
        x1, y1 = number(el, 'x1'), number(el, 'y1')
        x2, y2 = number(el, 'x2'), number(el, 'y2')
        box = [min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)]
    elif tag in ('polyline', 'polygon'):
        box = points_bbox(el.get('points'))
    elif tag == 'path':
        box = path_bbox(el.get('d'))
    elif tag == 'image':
        x, y = number(el, 'x'), number(el, 'y')
        box = [x, y, x + number(el, 'width'), y + number(el, 'height')]
    else:
        return None

    box = transform_box(box, matrix)
    if tag in BACKDROP_TAGS and is_backdrop(box, board):
        return None
    return box


def motif_elements(root, art_els):
    """算图案用的元素表。

    有 <g id="art"> 的稿子直接读容器的孩子：拆层时排在书名组之后的那点图形
    （哑光黑底部那个橙色方块就是）会被当作「压在文字之上」发到 shade 层，
    但它照样是图案，书名一样不能压上去。
    """
    containers = [el for el in root if local(el.tag) == 'g' and el.get('id') == 'art']
    if not containers:
        return [el for el in art_els if not is_text_group(el)]
    skip = ('defs', 'style', 'title', 'desc')
    return [
        el
        for el in containers[0]
        if local(el.tag) not in skip and not is_text_group(el)
    ]


def decor_spans(elements, origin, across_size, along_size, design_id):
    """画稿里图案占住的沿长区间（设计稿坐标、相对书脊左上角，已合并、已裁到书脊内）。

    返回升序且互不相邻的区间表；空表表示这套稿子只有底色/晕染，没有局部图案。
    """
    if design_id in DECOR_OVERRIDES:
        return [[round(float(start), 3), round(float(end), 3)] for start, end in DECOR_OVERRIDES[design_id]]

    board = [origin[0], origin[1], origin[0] + across_size, origin[1] + along_size]
    boxes = [element_bbox(el, board) for el in elements]
    spans = []
    for box in boxes:
        if not box:
            continue
        start = max(box[1] - origin[1], 0.0)
        end = min(box[3] - origin[1], along_size)
        if end - start <= 0.001:
            continue
        spans.append([start, end])

    spans.sort()
    merged = []
    for start, end in spans:
        if merged and start <= merged[-1][1] + 0.001:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return [[round(start, 3), round(end, 3)] for start, end in merged]


def split_layers(root, spine, styles):
    """把设计稿拆成 art / shade 两层（渲染时文字夹在中间，见 art.tsx 头注释）。

    两种稿子的分层写法不一样，各认各的：

      · Illustrator 老稿：书名组、作者组摆在顶层，柱面光影是它们后面的满幅渐变
        矩形 —— 见过文字组之后再遇到「铺满书脊的渐变矩形」就算光影；
      · 手写新稿：画稿收在 <g id="art"> 里（书名组嵌在其中），容器之后的兄弟节点
        就是压在文字上的光影层，不用再猜。

    稿子里只要有 <g id="art">，就只按第二种认，免得把画稿里的压槽线误判成光影。
    """
    art, shade = [], []
    seen_text = False
    # <title>/<desc> 是给读屏器和编辑器看的元数据，不是画面
    skip = ('defs', 'style', 'title', 'desc')

    containers = [el for el in root if local(el.tag) == 'g' and el.get('id') == 'art']
    if containers:
        body = containers[0]
        for el in body:
            if is_text_group(el):
                seen_text = True
                continue
            (shade if seen_text else art).append(el)
        for el in root:
            if el is body or local(el.tag) in skip:
                continue
            shade.append(el)
        return art, shade

    for el in root:
        if local(el.tag) in skip:
            continue
        if is_text_group(el):
            seen_text = True
            continue
        if seen_text and is_full_bleed(el, spine, styles):
            shade.append(el)
        else:
            art.append(el)
    return art, shade


def build(design_id, path):
    root = ET.parse(path).getroot()
    styles = collect_styles(root)
    spine = spine_rect(root)
    artboard = [float(value) for value in (root.get('viewBox') or '0 0 0 0').split()]
    crop = (spine['width'] < artboard[2] - 1) or (spine['height'] < artboard[3] - 1)
    if crop:
        # 画板比书脊大（设计师在大画布上摆了一块书脊）：viewBox 裁到那块书脊上
        view_box = '{0} {1} {2} {3}'.format(
            round(spine['x'], 3), round(spine['y'], 3),
            round(spine['width'], 3), round(spine['height'], 3),
        )
        across_size, along_size = spine['width'], spine['height']
    else:
        view_box = '{0} {1} {2} {3}'.format(
            round(artboard[0], 3), round(artboard[1], 3),
            round(artboard[2], 3), round(artboard[3], 3),
        )
        across_size, along_size = artboard[2], artboard[3]
    origin = (spine['x'] if crop else artboard[0], spine['y'] if crop else artboard[1])

    # 顶层 defs 里的东西要按层发到 <defs> 里；底色兜底还得认得嵌在画稿里的
    # defs（新稿的底色渐变就写在那儿），所以另外收一份「哪儿都算」的。
    gradients = []
    for block in root:
        if local(block.tag) == 'defs':
            gradients.extend(child for child in block if local(child.tag) in DEF_TAGS)
    defs_anywhere = [
        child
        for block in root.iter()
        if local(block.tag) == 'defs'
        for child in block
        if local(child.tag) in DEF_TAGS
    ]

    art_els, shade_els = split_layers(root, spine, styles)
    decor = decor_spans(
        motif_elements(root, art_els), origin, across_size, along_size, design_id
    )

    images, asset_names, imports = [], {}, []
    for el in art_els:
        for node in el.iter():
            if local(node.tag) != 'image':
                continue
            href = node.get(f'{{{XLINK_NS}}}href') or node.get('href') or ''
            if not href.startswith('data:image/'):
                continue
            ext = re.match(r'data:image/(\w+)', href).group(1)
            index = len(images) + 1
            stem = f'{design_id}-{index}'
            os.makedirs(ASSET_DIR, exist_ok=True)
            with open(os.path.join(ASSET_DIR, f'{stem}.{ext}'), 'wb') as handle:
                handle.write(base64.b64decode(href.partition(',')[2]))
            images.append(stem)
            asset_names[href] = f'{design_id}Wash{index}'
            imports.append(
                f"import {design_id}Wash{index} from './design-assets/{stem}.{ext}';"
            )

    def render(layer, elements):
        used = set()
        for el in elements:
            for node in el.iter():
                values = list(node.attrib.values()) + list(decls_of(node, styles).values())
                for value in values:
                    used.update(re.findall(r'url\(#([^)]+)\)', value or ''))
        ids = {name: f'{design_id}-{layer}-{name}' for name in used}

        lines = ['    <>', '      <defs>']
        for gradient in gradients:
            if gradient.get('id') in used:
                lines.append(emit_el(gradient, styles, ids, 8, asset_names))
        lines.append('      </defs>')
        for el in elements:
            if local(el.tag) != 'style':
                lines.append(emit_el(el, styles, ids, 6, asset_names))
        lines.append('    </>')
        return '\n'.join(lines)

    return {
        'viewBox': view_box,
        'width': round(across_size, 3),
        'height': round(along_size, 3),
        'base': base_color(art_els, defs_anywhere, styles),
        'decor': decor,
        'title': text_spec(root, styles, 'title', origin),
        'author': text_spec(root, styles, 'author', origin, required=False),
        'art': render('art', art_els),
        'shade': render('shade', shade_els),
        'imports': imports,
    }


def main():
    entries = []
    for design_id, filename in DESIGNS:
        path = os.path.join(DESIGN_DIR, filename)
        if not os.path.exists(path):
            raise SystemExit(f'缺少设计稿：{path}')
        entries.append((design_id, build(design_id, path)))

    imports = []
    for _, entry in entries:
        imports.extend(entry['imports'])

    blocks = []
    for design_id, entry in entries:
        title = json.dumps(entry['title'], ensure_ascii=False)
        decor = json.dumps(entry['decor'])
        author = json.dumps(entry['author'], ensure_ascii=False)
        blocks.append(
            f"  {design_id}: {{\n"
            f"    viewBox: '{entry['viewBox']}',\n"
            f"    width: {entry['width']},\n"
            f"    height: {entry['height']},\n"
            f"    base: '{entry['base']}',\n"
            f"    title: {title},\n"
            f"    decor: {decor},\n"
            f"    author: {author},\n"
            f"    art: (\n{entry['art']}\n    ),\n"
            f"    shade: (\n{entry['shade']}\n    ),\n"
            f"  }},"
        )

    id_union = ' | '.join(f"'{design_id}'" for design_id, _ in entries)
    header = (
        "// Auto-generated by scripts/build-spine-art.py — do not edit manually.\n"
        "//\n"
        "// 设计稿（src/app/shelf/spine/design/*.svg）是 Illustrator 导出的书脊：画板就是书脊\n"
        "// 的实际尺寸（27.3 × 145），所以这里按原坐标内联，viewBox 指着书脊那一块，由外层把\n"
        "// 27.3 × 145 拉成 app 里的（厚度 × 书高）—— 横跨跟着厚度走，沿长跟着书高走。\n"
        "//\n"
        "// <text> 在生成时丢掉了：书名/作者是动态的，字号得按厚度推（见 shared.tsx）。\n"
        "// 留下的 title/author 只有位置、字号、墨色，供模版摆那个文字框。\n"
        "//\n"
        "// art   = 底色 + 纹样，铺在文字之下\n"
        "// shade = 柱面光影、首尾压暗。设计稿里它压在文字之上，所以渲染时排在文字之后\n"
    )
    source = (
        header
        + '\n'.join(imports)
        + "\nimport type { ReactNode } from 'react';\n\n"
        + "/** 设计稿里的一列字：书名、作者各一份（作者那份可能没有） */\n"
        + "export interface SpineTextSpec {\n"
        + "  /** 第一个字的基线（沿长方向的设计稿坐标） */\n"
        + "  firstBaseline: number;\n"
        + "  /** 最后一个字的基线 */\n"
        + "  lastBaseline: number;\n"
        + "  /** 设计稿字号。画板厚 27.3，所以比值 = size / 27.3 */\n"
        + "  size: number;\n"
        + "  /** 基线间距，也就是设计稿里的字距 */\n"
        + "  advance: number;\n"
        + "  /** 样稿上写了几个字（只作参考） */\n"
        + "  sampleCount: number;\n"
        + "  /** 墨色 */\n"
        + "  ink: string;\n"
        + "  /** 设计稿写死的字体族（多半没装机），只作参考 */\n"
        + "  family: string;\n"
        + "  /** 字列在横跨方向的位置 */\n"
        + "  across: number;\n"
        + "}\n\n"
        + "export interface SpineArt {\n"
        + "  /** 内联 SVG 的 viewBox：设计稿里书脊那一块 */\n"
        + "  viewBox: string;\n"
        + "  /** 书脊在设计稿里的横跨宽度 */\n"
        + "  width: number;\n"
        + "  /** 书脊在设计稿里的沿长高度 */\n"
        + "  height: number;\n"
        + "  /** 底色兜底，给 Shell 当背景 */\n"
        + "  base: string;\n"
        + "  /**\n"
        + "   * 稿子里图案占住的沿长区间（设计稿单位，相对书脊左上角，升序不相邻）。\n"
        + "   * 满幅的底色/晕染不算图案，所以「只有底没有图形」的稿子这里是空表。\n"
        + "   * 书名只在图案之外的空白区里排，见 spine/zones.ts。\n"
        + "   */\n"
        + "  decor: Array<[number, number]>;\n"
        + "  title: SpineTextSpec;\n"
        + "  /** 设计稿没画作者那一行时是 null，模版跳过作者就行 */\n"
        + "  author: SpineTextSpec | null;\n"
        + "  art: ReactNode;\n"
        + "  shade: ReactNode;\n"
        + "}\n\n"
        + f"export type SpineArtId = {id_union};\n\n"
        + "export const SPINE_ART: Record<SpineArtId, SpineArt> = {\n"
        + '\n'.join(blocks)
        + "\n};\n"
    )

    with open(OUT_FILE, 'w', encoding='utf-8') as handle:
        handle.write(source)
    print(f'已生成 {os.path.relpath(OUT_FILE, ROOT)}（{len(source)} 字节）')


if __name__ == '__main__':
    main()
