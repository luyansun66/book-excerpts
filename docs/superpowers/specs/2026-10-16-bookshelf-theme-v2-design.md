# 书架 v2 主题（书脊混排 + 横放堆叠）—— 设计文档

**日期：** 2026-10-16
**状态：** 设计已定稿，待用户 review
**参考实现：** `/Users/yayayasun/Downloads/dogear-shelf/`（只读，约 711 LOC）

---

## 1. 背景与目标

「折角」目前只有一个书架主题：**封面朝外、一行横滑**。本次要加第二个主题，
搁板本身保持不变，改变的是书本怎么摆。

**目标：**

1. 第二个书架主题：竖放展示书脊、竖放展示书封（带立体感）、横放展示书脊且可堆叠。
2. 每本书的摆放形式逐本可设（「添加书籍」与「编辑书籍」两个表单都要能设）。
3. 书脊样式逐本可选，并为「后续几套模版可自定义选择」留出扩展点。
4. 两个主题在设置页「**书架设置**」段里全局切换。
5. 搁板样式在两个主题里完全一致。

**非目标：**

- 不改经典主题的任何视觉。`src/app/__tests__/shelfScroll.test.ts` 与
  `pageLayers.test.ts` 里的源码字面量断言必须原样保绿。
- 不动数据库版本、不写 `.upgrade()` 迁移。
- 本轮不让云同步携带新字段（见 §5.4，后续单独做）。
- 新主题下不提供长按拖拽重排（见 §9.5，明确取舍）。
- 不做书脊模版的具体美术设计。本轮只注册 `default` 一种模版，将来由用户出模版。

---

## 2. 关键决策一览

| # | 决策 | 选择 | 理由 |
|---|---|---|---|
| D1 | 新主题的组件架构 | **方案 C**：新建 `src/app/shelf/` 放排布引擎与新组件；`ShelfView` 按主题分支；把**搁板**抽成共用 `<ShelfBoard />` | 新主题的 DOM 结构与经典主题完全不同，硬塞进 `ShelfRow` 会让一个本来就 600 行的组件变成两个主题的杂糅体 |
| D2 | 书本尺寸怎么来 | 由 `book.id` 哈希派生，**不新增手填字段** | 不用动数据库、不用加表单字段、不用迁移；同一本书在任何设备上尺寸一致 |
| D3 | 摆放形式的取值 | 4 值：`auto`(默认) / `spine` / `cover` / `stack` | 「自动」让大多数用户不用做任何事；另外 3 个是显式覆盖 |
| D4 | 书脊模版粒度 | **每本书各选一套**，用户不选则用默认模版 | 用户明确要求逐本（不是全局） |
| D5 | 设置页第二段改名 | 「分类管理」→「**书架设置**」 | 用户从候选里选定 |
| D6 | 主题偏好的存储 | `localStorage`，键 `bookwrite:shelfTheme` | 是「一台设备的显示偏好」，不是书籍数据；不进库、不进同步 |
| D7 | 新主题下的排布 | 每个分类**多块搁板纵向折行**，横向不滚动 | 用户已确认 |
| D8 | 竖放·书封的立体感 | 固定约 15° 的 CSS 3D 三面（封面 / 书脊 / 书页切口）+ 书槽 + 反光 + 接触阴影 | 用户要求「稍微有立体感」；参考代码 `Book3D.tsx` 已有可用配方 |
| D9 | 新主题下的长按拖拽重排 | **不做** | 经典主题用像素步长换算落点，在「多排折行」下没有意义 |

**被否掉的备选：**

- 把新主题塞进现有 `ShelfRow`（同一个组件里堆两套排布逻辑）：改造成本比重写高，
  且会直接威胁 §11.1 里那两条源码断言。
- 把手填的「页数 / 厚度」加进 `Book`：要动数据库 + 两个表单 + 迁移，而收益只是
  「尺寸更准一点」。参考代码正是用 `pages` 算尺寸的，我们放弃它换零迁移。
- 「经典 / 新主题」直接复用 `book.layout` 之类的书籍字段表达：主题是全局显示偏好，
  和书的数据没有关系。
- 竖放·书封面用「不倾斜的单面 + 一条书脊侧条」模拟立体：几何最简单，但立体感弱一档。
  保留为**降级备选**（见 §8.4）。

---

## 3. 尺寸模型：一本书只有两个内在量

### 3.1 公理

**一本假书在书架上的物理属性只有两个：书高 `L`、书脊厚 `T`。**
竖放、横放、堆叠全都是把这两个数换个方向摆。

| 摆放形式 | 宽（水平占用） | 高（垂直占用） |
|---|---|---|
| 竖放·书脊 | `T` | `L` |
| 竖放·书封 | `L × 94/145 ≈ 0.648 L`（3D 倾斜后按 §3.4 算投影宽） | `L` |
| 横放（堆叠中的一本） | `L` | `T`（即这摞高度里它贡献的那一段） |

这一条同时消掉了参考代码里的一个不一致：它站立书脊宽用 `clamp(pages*0.12, 24, 58)`、
横放厚度用 `clamp(pages*0.085, 20, 40)`，**同一个物理量两套公式**。本设计里
「竖放时书脊占的宽」和「横放堆叠时贡献的高」永远是同一个 `T`。

封面宽高比从 `src/app/shelfScroll.ts` 现有的 `SHELF_COVER_WIDTH`(94) /
`SHELF_COVER_HEIGHT`(145) 取，不写死小数。

### 3.2 书高 `L`：4 档 + 档内抖动

种子：`hashSeed('L:' + book.id)`

| 档 | 区间（px） | 权重 |
|---|---|---|
| 矮（口袋本） | 192 – 200 | 15% |
| 中（常规） | 210 – 218 | 50% |
| 高（精装） | 228 – 236 | 27% |
| 超高（大开本） | 246 – 254 | 8% |

档内均匀取一个整数。所以不是 4 个死值，而是 4 个「开本家族」——参考代码用的是
`HEIGHTS = [210, 228, 246]` 三个死值，书架排出来会有明显的机械感。

**取数方式（§3.3 与 §4 的各路决定同）：**

```ts
const rng = mulberry32(hashSeed('L:' + book.id));  // 每本、每维度一条独立随机流
const r = rng();        // 第 1 抽 → 落进累计权重区间，选出一档
const jitter = rng();   // 第 2 抽 → 在 [min, max] 上均匀取整
const L = Math.round(min + jitter * (max - min));
```

取数顺序固定、流彼此独立 → 完全确定，且与书架上别的书无关。

### 3.3 书脊厚 `T`：3 档 + 档内抖动

种子：`hashSeed('T:' + book.id)`（取数方式见 §3.2）

| 档 | 区间（px） | 权重 |
|---|---|---|
| 薄 | 22 – 28 | 25% |
| 中 | 30 – 40 | 55% |
| 厚 | 42 – 56 | 20% |

### 3.4 两个维度必须解耦

`L` 和 `T` **用不同的种子盐**（`'L:'` / `'T:'`）。参考代码两个维度来自同一个
`mulberry32(hashSeed(shelfId:bookId))` 随机流，于是「厚」和「高」是绑定的，
书架上会出现「厚的必然高」的规律感。分开播种后才会出现矮厚本、高大薄本这类
真实组合。§11.2 第 4 条测试专门守这一点。

### 3.5 竖放·书封的投影宽

3D 视角固定倾斜 `A = 15°`，倾斜后水平投影宽：

```
W_projected = round( L × (94/145) × cos A + T × sin A )
```

**这个值由引擎算进 `unit.width`**，渲染层不自己猜——守住「引擎只算几何、
渲染层只管画」的边界。

### 3.6 行高与对齐

- `ROW_HEIGHT = 268`（最高档书 254 + 14px 余量；hover 抬起 8px 后还剩 6px，
  不会顶到上一块搁板。参考代码是 270 / 最高档 246）
- 所有单位 `align-items: flex-end`，脚线对齐搁板

---

## 4. 逐本独立：相对参考代码的一处升级

参考代码**逐本播种尺寸**，但**朝向与起摞共用一个书架级随机流**
（`mulberry32(hashSeed(shelfId))` 顺序消耗）。后果：往书架中间插一本书，
后面所有书的朝向和分组全部重掷，整片书架“哗”地变脸。

本设计把三个随机决定全部改成纯 `book.id` 派生：

| 决定 | 种子 |
|---|---|
| 书高 `L` | `hashSeed('L:' + id)` |
| 书脊厚 `T` | `hashSeed('T:' + id)` |
| 是否特色位（封面朝外） | `hashSeed('O:' + id)` |
| 是否开一摞 | `hashSeed('S:' + id)` |
| 一摞几本 | `hashSeed('Sn:' + id)`（只用**起始那本**的种子） |

于是**插入或删除一本书，其它书的尺寸和封面朝向一个像素都不变**。

**诚实的边界：分组与折行仍会变。** 谁和谁一摞、在第几本换行，是顺序相关的
物理事实，任何算法都躲不掉；同摞内的书被删掉，那一摞当然要重排。

---

## 5. 数据模型与持久化

### 5.1 `Book` 新增两个可选字段

`src/app/types.ts`：

```ts
export type BookLayout = 'auto' | 'spine' | 'cover' | 'stack';

export interface Book {
  // ...现有字段不动
  /** 书架 v2 主题下的摆放形式。缺省 = 'auto'。只在 v2 主题生效。 */
  layout?: BookLayout;
  /** 书脊模版 id。缺省 = 'default'。只在 v2 主题生效。 */
  spineTemplate?: string;
}
```

可选字段的先例已有：`sortOrder?`、`finishedAt?`。

### 5.2 兜底放在读取侧，不让 `undefined` 进入渲染

`src/app/shelf/bookLayout.ts` 导出：

```ts
export const BOOK_LAYOUTS: BookLayout[] = ['auto', 'spine', 'cover', 'stack'];
export function resolveLayout(book: Book): BookLayout;          // book.layout ?? 'auto'
export function resolveSpineTemplate(book: Book): string;       // book.spineTemplate ?? 'default'
```

三个入口都可能缺字段，全部由这两个函数接住：

1. 旧数据（新版之前建的库）
2. 旧备份导入（`src/app/db/prepare.ts` 的 `prepareImportData` 只修 `categoryId`）
3. 云同步拉回来的数据（见 §5.4）

### 5.3 不动数据库版本

已核验 `src/app/db/index.ts`：`DB_VERSION = 4`，Dexie 存整个对象，
`layout` / `spineTemplate` **都不做索引**，因此 `addBook` 的 `{ ...book }` 与
`updateBook` 的 `Partial<Book>` 会自动携带。

- **不 bump `DB_VERSION`**
- **不写 `.upgrade()`**
- **不需要迁移脚本**

文件第 224 行已有同类先例的注释说明。这也是选「尺寸用 `book.id` 派生」而非
「手填页数」的同一个理由：零迁移。

### 5.4 云同步不会自动带上新字段（已知边界）

`src/app/supabase/sync.ts`：

- `pushAllData` 是**显式列字段** upsert（`title` / `author` / `cover_type` /
  `cover_data` / `sort_order` / `created_at`）
- `pullAllData` 也是**显式 map 回 `Book`**

因此：

- 新字段不写进 `sync.ts` → **换设备后丢失**，读取时兜底成 `auto` + `default`，
  不报错，只是设置回到默认
- 要真正同步，需要改这两处 **+ 远端 `books` 表加两列**，依赖 Supabase 侧改表

**本轮不做。** 建议在该文件加一行注释登记这个已知不同步字段。用户已确认
「云同步后续再做」。

### 5.5 主题偏好走 localStorage

`src/app/shelf/shelfTheme.ts`（约 30 行）：

```ts
export type ShelfTheme = 'classic' | 'shelfV2';
export const SHELF_THEME_KEY = 'bookwrite:shelfTheme';
export function readShelfTheme(): ShelfTheme;     // 缺省 'classic'
export function writeShelfTheme(t: ShelfTheme): void;
export function useShelfTheme(): [ShelfTheme, (t: ShelfTheme) => void];
```

- 读写走 `src/app/components/timer/timerSession.ts` 里现成的 `safeLocalStorage()`
  （已 try/catch，隐私模式不炸）
- 用 `useSyncExternalStore` + 模块级订阅集合，`SettingsPage`（写）与 `ShelfView`（读）
  天然同步（只保证同一标签页内；不监听 `storage` 事件做跨标签同步，本 app 用不到）
- **默认 `'classic'`**：装了新版但没进过设置页的用户，打开还是熟悉的样子

**为什么不放进 `store.tsx`：** 那是个 266 行的数据上下文（分类、书籍、搜索、
选中态）。主题是纯显示偏好，与书籍数据无关；放进去会让「切换主题」触发所有
`useApp()` 消费者重渲染。独立模块还能在测试里直接 import，不用挂 Provider。

---

## 6. 排布引擎（纯函数，零 React、零 DOM）

### 6.1 签名

`src/app/shelf/shelfLayoutV2.ts`：

```ts
export function layoutShelfV2(books: Book[], rowWidth: number): ShelfRow[];

export type PlacedUnit =
  | { kind: 'standing'; book: Book; orientation: 'spine' | 'cover';
      /** 竖放·书脊 = T；竖放·书封 = §3.5 的投影宽 */
      width: number;
      height: number;      // = L
      thickness: number;   // = T，渲染层画书脊侧面要用
      gapBefore: number; gapAfter: number }
  | { kind: 'stack';
      /** length = L（这本横躺占的水平长度）；thickness = T（它在这摞里占的高） */
      items: { book: Book; length: number; thickness: number;
               jitter: number; rotate: number }[];
      width: number; height: number; gapBefore: number; gapAfter: number };

export interface ShelfRow { units: PlacedUnit[]; height: number }
```

输入的 `books` 调用方已按 `sortOrder` 排好。函数不读时间、不读随机源、不读 DOM，
同输入必得同输出。

**几何全部在引擎里算完。** 渲染层的 `width` / `height` / `thickness` / `length`
一律取引擎给的值，不自己查档位表、不自己乘 `cos`、不自己猜书脊厚——否则
「引擎只算几何，渲染层只管画」这条边界就破了，同一个 `T` 会出现两套算法。

### 6.2 可调常量（全部导出，集中一处）

```ts
export const ROW_HEIGHT = 268;
export const ROW_GAP = 18;             // 堆叠摞左右各留
export const COVER_GAP = 4;            // 封面朝外的书左右各留
export const STACK_MAX_HEIGHT = 170;
export const STACK_MIN_BOOKS = 3;
export const STACK_MAX_BOOKS = 5;
export const STACK_PROBABILITY = 0.25; // 起摞概率
export const COVER_PROBABILITY = 0.17; // 特色位（封面朝外）概率 ≈ 1/6
export const STACK_JITTER = 7;         // 横放错位 ±px
export const STACK_ROTATE = 0.8;       // 横放微旋转 ±deg
export const COVER_TILT_DEG = 15;      // 竖放·书封的 3D 视角
```

两张档位表本身定义在 `sizes.ts`（值就是 §3.2 / §3.3 那两张表，一字不改），
引擎 import 它们：

```ts
export interface SizeBand { min: number; max: number; weight: number }

/** §3.2 书高：矮 / 中 / 高 / 超高 */
export const HEIGHT_BANDS: readonly SizeBand[] = [
  { min: 192, max: 200, weight: 0.15 },
  { min: 210, max: 218, weight: 0.50 },
  { min: 228, max: 236, weight: 0.27 },
  { min: 246, max: 254, weight: 0.08 },
];

/** §3.3 书脊厚：薄 / 中 / 厚 */
export const THICKNESS_BANDS: readonly SizeBand[] = [
  { min: 22, max: 28, weight: 0.25 },
  { min: 30, max: 40, weight: 0.55 },
  { min: 42, max: 56, weight: 0.20 },
];
```

### 6.3 摆放形式的决策优先级

**第一遍：逐本算「基准类别」，只看这本书自己的种子，不看邻居。**

| 条件 | 基准类别 |
|---|---|
| 显式 `spine` | 竖放·书脊 |
| 显式 `cover` | 竖放·书封 |
| 显式 `stack` | **横躺**（用户点名要平躺） |
| `auto` 且 `hashSeed('O:' + id) < COVER_PROBABILITY` | 竖放·书封（特色位） |
| `auto` 其余 | **可吸收**（默认竖放·书脊，也可能被吸进一摞） |

**第二遍：从左往右逐个推进，把「横躺 + 可吸收」的连续段收成一摞。**

- 遇到**显式 `stack`** → 开一摞，继续吸收后面紧邻的显式 `stack`。
  单独一本就横躺一本，这是合法画面，**不套用最少本数**
- 遇到**可吸收**且 `hashSeed('S:' + id) < STACK_PROBABILITY` → 开一摞，
  期望本数 `N = STACK_MIN_BOOKS + floor(hashSeed('Sn:' + startId) × (STACK_MAX_BOOKS − STACK_MIN_BOOKS + 1))`
  → 3–5 本，只由起始那本决定
- **吸收规则（两种摞共用，按顺序判）：**
  1. 只吸收**紧邻**的合格书——显式 `stack` 只吃显式 `stack`，auto 摞只吃「可吸收」。
     遇到任何其它类别（特色位封面、显式 `spine` / `cover`）**立即停止吸收**，
     绝不跳过它去够后面那本——否则屏幕上这一摞就不是连着的了
  2. 逐本累加 `T`，**加入后若 Σ`T` > `STACK_MAX_HEIGHT` 就停止吸收**。
     用户显式设的横躺书被这个上限顶出来时**另起一摞**，不丢掉它的摆放形式
  3. auto 摞想收 3–5 本；**末尾凑不满时，凑到 ≥ 2 本照样成一摞**，
     只剩 1 本（起始本已经是最后一本）才**整摞取消**，这本退回竖放·书脊。
     §11.2 第 6 条另外守着 `STACK_MAX_HEIGHT` 上限。
     **取消规则不适用于显式 `stack`**——显式选择永远生效
- 开一摞时跳过被吸收的那几本；其余书继续按自己的基准类别处理
  （所以没被吸走的「可吸收」书，轮到自己时仍可起自己的摞）
- 其余一律竖放·书脊

**只有 `auto` 的书会被算法吸进摞，且只被吸进 auto 摞。** 用户显式设成
「竖放·书脊」的书绝不会被横过来——显式选择永远优先。

**顺序相关性**：第一遍逐本独立；第二遍「谁和谁一摞、在哪本折行」依赖前后顺序，
这是物理事实（§4 已如实说明，也是唯一会随增删书变化的东西）。

### 6.4 折行与间距

- 相邻竖放书**紧挨**（gap 0），这是真实书架的排法
- 堆叠摞左右各 `ROW_GAP`
- 封面朝外的书左右各 `COVER_GAP`
- 装不下就折成新的一块搁板（`used + gap + unit.width > rowWidth`）
- **`rowWidth <= 0` → 直接返回 `[]`**：首帧 `ResizeObserver` 还没量到宽，
  别在 0 宽里排出一本一块搁板
- 引擎把 `gapBefore` / `gapAfter` 算好返回，渲染层直接吃

---

## 7. 渲染层

### 7.1 共用搁板 `<ShelfBoard />`

把 App.tsx 里这一行**原样**搬进 `src/app/components/ShelfBoard.tsx`，两主题共用：

```jsx
{ margin: '4px 18px 0', height: 9, borderRadius: 4,
  background: 'var(--shelf-surface)',
  boxShadow: '0px 4px 6px 0px rgba(0, 0, 0, 0.2)' }
```

样式字面量一个值都不改，只换位置 → 经典主题外观零变化。

已核验：现有测试没有任何一条断言这行 div 的源码文本（`shelfScroll.test.ts` /
`pageLayers.test.ts` 断的是滚动容器的 props 与 `data-page-layer` 标记），
抽取安全。

同理把分类标题行（分类名 + `N books ›` + 拖拽柄 `⠿`）抽成
`<CategoryHeading />`，两主题共用。这是「在改到的代码里顺手做的、服务于本次目标
的小整理」，不是无关重构。

### 7.2 主题分支

```
theme === 'classic' → 现有 <ShelfRow />    一行、横向滚动、原样不动
theme === 'shelfV2' → 新 <ShelfRowV2 />    标题 + 多块搁板折行、横向不滚动
```

两主题外部全部共用：分类拖拽重排、空状态、`displayCats` 与 `books.filter` 取数、
点击进详情的回调。

**切换主题时直接换渲染树，不做过渡动画**——两个主题 DOM 结构完全不同，交叉淡入
要同时挂载两棵树，代价大于收益。

### 7.3 新主题组件树

```
ShelfRowV2（一个分类）
├── CategoryHeading                      共用
├── 第 1 块搁板
│   ├── 行容器  height:268 / align-items:flex-end / ResizeObserver 量宽
│   │   ├── SpineV2       竖放·书脊（查模版注册表）
│   │   ├── ShelfCover    竖放·书封  → 复用 BookCoverSurface
│   │   └── BookStack     横放堆叠
│   └── ShelfBoard                       共用
├── 第 2 块搁板
└── ...
```

宽度由 `ResizeObserver` 量出（沿用参考代码 `Shelf.tsx` 做法），
`useMemo(() => layoutShelfV2(books, width), [books, width])`。

### 7.4 交互

- **点击** → `selectBook`，与经典主题一致
- **hover** → 竖放的书 `translateY(-8px)`；摞里**每一本各自 hover** `translateX(+8px)`，
  这样一眼能看出这摞有几本
- **长按拖拽重排 → 不提供**（见 §9.5）

---

## 8. 书脊模版注册表

### 8.1 接口

`src/app/shelf/spineTemplates.tsx`：

```ts
export interface SpineRenderContext {
  book: Book;
  width: number;       // 竖放 = T；横放 = L
  height: number;      // 竖放 = L；横放 = T
  vertical: boolean;   // true 竖排文字 / false 横排文字
  thickness: number;   // 书脊厚 T，字号按它推（与方向无关）
}

export interface SpineTemplate {
  id: string;      // 'default'
  name: string;    // 「经典压印」——将来设置页给用户看
  render(ctx: SpineRenderContext): React.ReactNode;
}

export const SPINE_TEMPLATES: SpineTemplate[] = [defaultTemplate];
export const DEFAULT_SPINE_TEMPLATE_ID = 'default';
export function getSpineTemplate(id?: string): SpineTemplate;  // 查不到回 default
```

本轮只注册 `default` 一项。将来用户出模版 = 往数组加一条，
**排布引擎与接线代码一行都不用改**。

### 8.2 `default` 模版

内容取自参考代码 `Spine.tsx`：

- 柱面光影渐变：竖放 `linear-gradient(90deg, rgba(0,0,0,.28), rgba(255,255,255,.14) 28%, rgba(0,0,0,.05) 60%, rgba(0,0,0,.3))`；
  横放同值换 `180deg`
- 两条 2px 压印横带（`opacity: .55`，距边 12px，左右缩进 18%）
- 竖排书名 `writingMode: vertical-rl`
- `titleSize = max(11, min(20, T × 0.42))`；`T >= 30` 才显示作者
- 字体 `'Songti SC','STSong','Noto Serif SC',serif`

**必须改的一处：** 参考代码底色来自 `book.color` + `isDark(book.color)`，
**本项目 `Book` 没有 `color` 字段**。所以底色改成「与这本书的占位封面色同源」——
从 `src/app/components/BookCoverSurface.tsx` 里把挑色逻辑抽成
`placeholderColorFor(book)` 共用。否则会出现一本绿封面配一条紫书脊。

**深色模式：** 柱面渐变用中性 rgba 黑白遮罩，深浅两模式都成立，
**不需要新增令牌、不需要写死浅色**（符合 `tokens.css` 里的令牌纪律）。

### 8.3 竖放·书封的立体感（约 15° 固定视角）

| 面 | 内容 | 来源 |
|---|---|---|
| 封面（正） | 图片封面 / 占位封面 / 「读完」角标 | **复用 `BookCoverSurface`**，不重写 |
| 书脊（左） | 宽 `T`、高 `L` 的完整书脊 | **同一个 `SpineV2` 模版** |
| 书页切口（顶） | 很窄的一条纸张纹 `repeating-linear-gradient` | 参考代码 `Book3D` 的 `PAGES_TOP` |

关键点：**书脊侧面与竖放书脊走同一个模版注册表**。于是竖放·书脊、竖放·书封的
侧面、横放堆叠的书脊，三处都是同一套模版渲染出来的——将来换书脊样式，
所有视角同时跟着变，不会漏掉某一种摆放。

另取参考代码三笔细节：

- **书槽**：封面左边缘 `linear-gradient(90deg, rgba(0,0,0,.4), rgba(255,255,255,.14) 45%, transparent)`
- **纸张反光**：封面上一道 `linear-gradient(115deg, rgba(255,255,255,.14), transparent 40%, rgba(0,0,0,.12))`
- **接触阴影**：脚底 `radial-gradient` 椭圆地面影 + `blur(8px)`

**克制的部分：** 视角固定、不拖拽、不旋转、hover 不转。hover 只做与竖放书脊一致的
`translateY(-8px)`。小角度 + 静态 + 厚度只有 `T`（22–56px）三条一起把立体感压在
「一眼看出是本书」，而不是「书架上摆了个 3D 演示」。

### 8.4 降级备选

真 CSS 3D 有已知的坑：`preserve-3d` 与页面层上 motion 的 `x` 变换叠加时，
可能压不住 z-order 或闪烁。

若真出现，退到「不倾斜的单面 + 一条 `T` 宽的书脊竖条」：宽 = `L × 0.648 + T`，
几何最简，立体感弱一档。该组件自包含（几十行），切换成本低，在目视验收阶段决定。

---

## 9. 接线

### 9.1 两个表单共用一个控件组

新增 `src/app/components/BookAppearanceFields.tsx`，添加/编辑两个表单共用：

```tsx
<BookAppearanceFields
  layout={layout}                 spineTemplate={spineTemplate}
  onLayoutChange={setLayout}      onSpineTemplateChange={setSpineTemplate}
/>
```

自带样式（全部走令牌），两表单不再各写一套，将来加模版只有一个地方要改。

**① 摆放形式** — 4 个横向 chip（沿用设置页分段控件的视觉）：

| 值 | 显示名 | 说明文案 |
|---|---|---|
| `auto` | 自动 | 由书架自己安排，竖放为主 |
| `spine` | 竖放·书脊 | 只露出书脊 |
| `cover` | 竖放·书封 | 封面朝外（新主题下带立体感） |
| `stack` | 横放·堆叠 | 平躺，会和相邻的书叠成一摞 |

**② 书脊样式** — 从 `SPINE_TEMPLATES` map 出来。当前只有一项，
渲染出的就是唯一一个处于选中态的 chip「经典压印」。

### 9.2 「不选就走默认」怎么落地

**不写任何「如果用户没选」的判断分支。** 默认值本身就是 state 初值：

```ts
const [layout,        setLayout]        = useState<BookLayout>('auto');
const [spineTemplate, setSpineTemplate] = useState<string>(DEFAULT_SPINE_TEMPLATE_ID);
```

打开表单时「自动」与「经典压印」已处于选中态；用户什么都不点、直接保存，
写进库的就是这两个默认值。

读取侧的兜底（§5.2）仍然保留，但服务的是另一批数据：旧数据、旧备份、
云同步拉回来的书——那三种情况下字段**真的不存在**。

落点：

- `AddBookSheet`：`handleSave` 里带进 `addBook({...})`；`reset()` 里归位两个 state
- `EditBookSheet`：两个本地 state，`useEffect([book])` 里用兜底函数重置，
  `handleSave` 里带进 `updateBook(book.id, {...})`
- 节奏与现有「更换封面」一致：**改完点保存才生效**，不即时写库

### 9.3 设置页

`src/app/components/SettingsPage.tsx` 三处小改：

```
key:   'cat'       → 'shelf'
label: '分类管理'   → '书架设置'
icon:  Layers      → LibraryBig
```

已核验：`SegmentKey` 与「分类管理」在测试里零引用。`LibraryBig` 已确认存在于
`lucide-react`（`Shelf` 不存在）。

内容区里 `<CategorySection />` **下方**加一条分割线，再渲染
`<ShelfThemeSection />`——即用户要求的「放在分类管理下方」。

### 9.4 `<ShelfThemeSection />`

新增 `src/app/components/sections/ShelfThemeSection.tsx`。

**① 书架主题** — 两张可选卡片（不用下拉框：只有两个选项，且这是视觉决定，
用户应该看见样子再选）：

```
┌─────────────┐  ┌─────────────┐
│  ▮▮▮ 竖条   │  │ ▮▯▮≡≡ 混排  │
│  经典        │  │  书架 v2     │
│  封面朝外，   │  │  书脊混排、   │
│  一行横滑     │  │  横放可堆叠   │
└─────────────┘  └─────────────┘
```

卡片里的示意图是**几根静态色块 div**（三根竖条 / 混排 + 一摞横条），不引用真实
排布组件——那是几十 KB 的渲染树，缩到 60px 高也看不清，还拖慢设置页。

**② 必须有的说明文字：**

> 摆放形式和书脊样式在「书架 v2」主题下生效，在「编辑书籍」里逐本设置。

理由：用户在经典主题下把某本书设成「横放·堆叠」，书架上什么都没变，会以为功能坏了。
这一句把预期说清楚。

**不加**「默认书脊样式」选择器——注册表里只有一项时，那是个只有唯一选项的假控件。
等模版多了再加。

### 9.5 新主题下不提供长按拖拽重排

经典主题用 `DRAG_HOLD_MS` / `SHELF_COVER_STRIDE` 像素步长换算落点。这套模型在
「多排折行」下没有意义：横向推 148px 可能只是推到隔壁那块搁板。

取舍：新主题靠「编辑书籍里改摆放形式」+「分类页里现成的拖拽排序」来调整。
用户已确认接受。

---

## 10. 文件清单

```
新增  src/app/shelf/rng.ts                     hashSeed（FNV-1a 32 位）+ mulberry32
                                              —— 本项目现在没有，参考代码 src/lib/rng.ts
新增  src/app/shelf/bookLayout.ts              类型 + 兜底函数 + 取值表
新增  src/app/shelf/sizes.ts                   档位表 + deriveSize(bookId) → { L, T }
新增  src/app/shelf/shelfLayoutV2.ts           排布引擎（纯函数）
新增  src/app/shelf/shelfTheme.ts              主题偏好（localStorage + useSyncExternalStore）
新增  src/app/shelf/spineTemplates.tsx         模版注册表 + default 模版
新增  src/app/shelf/SpineV2.tsx                渲染一条书脊（查注册表）
新增  src/app/shelf/ShelfRowV2.tsx             一个分类 = 标题 + 多块搁板
新增  src/app/shelf/ShelfCover.tsx             竖放·书封（3D 三面）
新增  src/app/shelf/BookStack.tsx              一摞横放
新增  src/app/components/ShelfBoard.tsx        共用搁板
新增  src/app/components/CategoryHeading.tsx   分类标题行（从 ShelfRow 抽出）
新增  src/app/components/BookAppearanceFields.tsx       摆放形式 + 书脊样式控件组
新增  src/app/components/sections/ShelfThemeSection.tsx 设置页「书架设置」新段

新增  src/app/__tests__/shelfSizes.test.ts      档位 / 权重 / 种子解耦
新增  src/app/__tests__/shelfLayoutV2.test.ts   排布 / 堆叠 / 折行（见 §11.2）
新增  src/app/__tests__/shelfTheme.test.ts      主题偏好兜底

改动  src/app/types.ts                         Book 加两个可选字段
改动  src/app/App.tsx                          ShelfRow 用上 ShelfBoard/CategoryHeading；ShelfView 加主题分支
改动  src/app/components/BookCoverSurface.tsx  抽出 placeholderColorFor 共用
改动  src/app/components/sheets/AddBookSheet.tsx     接入控件组
改动  src/app/components/BookDetailPage.tsx          EditBookSheet 接入控件组
改动  src/app/components/SettingsPage.tsx            第二段改名换图标 + 挂新段
改动  src/app/supabase/sync.ts                 加注释登记「新字段未同步」（不改逻辑）
```

---

## 11. 测试与验收

### 11.1 必须保绿的既有测试

| 文件 | 断言什么 | 为什么受威胁 |
|---|---|---|
| `src/app/__tests__/shelfScroll.test.ts` | 读 App.tsx 源码，断言 `deltaX > 5 && !isInsideHorizontalScroller(e.target)`、`data-shelf-cover`、`scrollSnapType: 'x mandatory'`、`scrollPaddingLeft: SHELF_SIDE_PADDING`、`paddingLeft/Right`、`shelfTrailingSlack(`、`pickShelfScrollTarget({`，且**不得**出现旧的固定步长 scrollBy | 动 App.tsx 的 ShelfRow |
| `src/app/__tests__/pageLayers.test.ts` | 读 App.tsx 源码，断言 `data-page-layer="shelf\|category\|detail"` 各自的 zIndex、常量顺序、scrim、pointer-events 门控 | 同上 |

对策：经典主题的 `ShelfRow` **只做「把两段 JSX 换成组件」的位置移动**，
不碰任何被断言的字符串；新主题全部走新组件。基线是 48 文件 / 428 测试全绿。

### 11.2 新增测试（排布引擎为主，纯函数无 DOM）

三个新文件，沿用 `src/app/__tests__/` 现有命名（模块测试用 camelCase）：

| 文件 | 覆盖 |
|---|---|
| `src/app/__tests__/shelfSizes.test.ts` | 第 2、3、4 条（档位、权重、种子解耦） |
| `src/app/__tests__/shelfLayoutV2.test.ts` | 第 1、5、6、7、8、9、10 条（排布） |
| `src/app/__tests__/shelfTheme.test.ts` | 第 11 条（主题偏好兜底） |

1. **确定性**：同输入调用两次，结果深度相等
2. **定义域**：1000 个假 id，`L` 全部落在 192–254、`T` 全部落在 22–56
3. **权重分布**：1000 个假 id 的档位频次与权重表偏差在容差内
4. **种子解耦**：高 246+ 的书里，`T` 的薄/中/厚三档**都必须出现**
5. **显式优先**：`spine` / `cover` / `stack` 各自产出对应 `kind` / `orientation`，
   且显式 `spine` 永不被吸入摞
6. **堆叠上限**：6 本全厚档（56px）的书，一摞高度 ≤ `STACK_MAX_HEIGHT`
7. **折行**：给定 300px 窄宽度，每行宽度 ≤ 300，行数符合手算预期
8. **空 / 单本 / 零宽**：`[]` → `[]`；单本 → 一个 `standing`；
   `rowWidth = 0` → `[]`
9. **独立性**：移除一本书，其它**不在同一摞内**的书的 `width` / `height` /
   `orientation` 不变
10. **兜底**：`resolveLayout({} as Book)` → `'auto'`；
    `getSpineTemplate('不存在')` → `default`
11. **主题偏好**：`readShelfTheme()` 无值时回 `'classic'`；`writeShelfTheme` 在
    localStorage 抛错时不炸

### 11.3 验收方式（如实说明能力边界）

我能做的：

- `npm test`（vitest）— 全绿，含上述新增用例
- `npx tsc --noEmit` 类型检查
- `npm run build` 构建通过

**我做不到自动截图。** 这台机器网络受限、装不了无头浏览器，无法出图。因此：

- **视觉验收由用户完成**：我可以 `npm run preview` 起服务，用户在浏览器 / 真机里看
- 验收清单：
  1. 设置页 → 「书架设置」→ 两张主题卡片可切换，切换后书架立刻变样
  2. 关掉 App 重开，主题选择还在（localStorage 生效）
  3. 书架 v2 下：书脊混排、封面朝外有立体感、横放成摞有错位和微旋转
  4. 浅色 / 深色两套都要看（书脊用中性遮罩，两边都应成立）
  5. 给一本书设成「横放·堆叠」再切回经典主题，书架外观不应有任何变化
  6. 添加一本书 → 不碰两个新控件直接保存 → 在 v2 主题下它按「自动」摆放
  7. 切换主题不闪、不残留旧文档流

---

## 12. 已知边界与后续

1. **云同步不带新字段**（§5.4）。换设备后 `layout` / `spineTemplate` 回到默认。
   要同步需改 `sync.ts` 两处 + 远端表加两列。
2. **分组与折行仍会随增删书变化**（§4）。这是顺序相关的物理事实。
3. **竖放·书封的 3D 可能在页面层变换下出问题**（§8.4），有降级备选。
4. **书脊模版目前只有一项**。模版注册表接口已按「多套模版」设计好，
   加模版不需要动引擎和接线。
5. **「默认书脊样式」偏好**（新书默认用哪套模版）现在没有。等模版超过一套时，
   在「书架设置」里加一个选择器。
6. **新主题下无长按拖拽重排**（§9.5）。
