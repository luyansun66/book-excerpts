/**
 * 《德米安》导入脚本
 *
 * 使用方法：
 * 1. 在浏览器中打开 App (http://192.168.0.101:5173/)
 * 2. 打开开发者工具控制台 (F12 → Console)
 * 3. 将以下全部代码粘贴到控制台，按回车
 */

(async function seedDemian() {
  try {
    // ─── 1. 获取封面图片 base64 ─────────────────────────────────
    console.log('🔄 正在下载封面图片…');
    const resp = await fetch('/demian-cover.png');
    const blob = await resp.blob();
    const coverBase64 = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
    console.log('✅ 封面图片下载完成');

    // ─── 2. IndexedDB 数据库引用 ────────────────────────────────
    const DB_NAME = 'bookwrite';
    const DB_VERSION = 1;

    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    // ─── 3. 查找「小说」分类 ──────────────────────────────────────
    const catTx = db.transaction('categories', 'readonly');
    const catStore = catTx.objectStore('categories');
    const categories = await new Promise((resolve) => {
      const req = catStore.getAll();
      req.onsuccess = () => resolve(req.result);
    });
    catTx.commit();

    const novelCat = categories.find(c => c.name === '小说' || c.name === 'Novel');
    if (!novelCat) {
      console.error('❌ 未找到「小说」分类，请先确认分类已初始化');
      return;
    }
    console.log(`✅ 找到分类：「${novelCat.name}」(ID: ${novelCat.id})`);

    // ─── 4. 检查书籍是否已存在 ──────────────────────────────────
    const bookTx = db.transaction('books', 'readonly');
    const bookStore = bookTx.objectStore('books');
    const allBooks = await new Promise((resolve) => {
      const req = bookStore.getAll();
      req.onsuccess = () => resolve(req.result);
    });
    bookTx.commit();

    const existing = allBooks.find(b => b.title === '德米安' && b.author === '黑塞');
    if (existing) {
      console.error('❌ 《德米安》已存在，跳过导入');
      return;
    }

    // ─── 5. 添加书籍 ─────────────────────────────────────────────
    const now = new Date().toISOString();
    const bookId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const newBook = {
      id: bookId,
      title: '德米安',
      author: '黑塞',
      categoryId: novelCat.id,
      coverType: 'upload',
      coverData: coverBase64,
      createdAt: now,
      updatedAt: now,
    };

    const addBookTx = db.transaction('books', 'readwrite');
    const addBookStore = addBookTx.objectStore('books');
    await new Promise((resolve, reject) => {
      const req = addBookStore.add(newBook);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    addBookTx.commit();
    console.log('✅ 书籍《德米安》已添加');

    // ─── 6. 添加摘录 ─────────────────────────────────────────────
    const allQuotes = [
      { text: '每个人都带着他诞生时的残渣，都背负着史前世界的黏液和蛋壳，直到生命的终点。', thought: '', page: null },
      { text: '每个生命都奋争着，试图从深渊中奔向各自的目标。人们彼此理解，但每个人，都只能解释其自身。', thought: '', page: null },
      { text: '一个世界是我的父宅。它甚至窄小，只住着我的双亲。我对这个世界的相当部分都十分熟悉。它意味着父亲和母亲，疼爱和严厉，榜样和学校。柔和的光泽，清澈与洁净属于这个世界，还有温存亲切的交谈，洗净的双手，考究的衣装和良好的礼节。', thought: '', page: null },
      { text: '断痕和截裂会重新弥合，会痊愈，被遗忘，但在我们心中最隐秘的角落，它却继续生活着，流着血。', thought: '', page: null },
      { text: '现在，我想，她要是回来——她觉察什么，回来吻我、询问我，慈爱而殷切地问候我，我就会哭出来，我喉咙中的石头就会熔化。', thought: '', page: null },
      { text: '不用上学的上午令人心醉，就像一头栽进童话世界。阳光不像在学校，被绿色的窗帘遮挡，它飞舞着，照进房间。', thought: '', page: null },
      { text: '我的苦难出人意料地获得了救恩。一些新事物也惠临我的生活，对我影响至今。', thought: '', page: null },
      { text: '而"一些人"总是倾心于那些让他们舒适的解释。', thought: '', page: null },
      { text: '人根本无须害怕任何人。如果一个人害怕某人，就会将此人的权力置于自身之上。比如一个人做了什么错事，被另一个人知道了——另一个人就具备了控制你的权力。', thought: '', page: null },
      { text: '得救的预感像刺鼻的馨香，临在我的心头！', thought: '', page: null },
      { text: '因为是他攫住我全部的根须，将我重新植入我遗失的乐土。', thought: '', page: null },
      { text: '许多人永远举步不前，一生都痛苦地眷念着无以挽回的昨日，做着逝去天堂的美梦，这一所有梦想中最致命的梦想。', thought: '', page: null },
      { text: '只要我们满心期盼，只要这个愿望真正萦回于我们全部的生命，我们就能拥有足够强大的意志去实施它。一旦如此，一旦人按照内心的命令去尝试，就能实现愿望，驾驭意志，宛如驾驭一匹良驹。', thought: '', page: null },
      { text: '而这才是真正的德米安。无情、古老，如野兽、如磐石，美而冷酷，死寂一片又充满密不透风、闻所未闻的生机。环绕他的是宁静的虚无，苍穹和星空，是孤绝的死！', thought: '', page: null },
      { text: '一切都变了。童年在我的四周坍塌成废墟。……我的世界堆满廉价代售的旧物，平淡乏味。书籍变成纸。音乐变成噪音。我像颗落英缤纷的秋树，无知无觉。无论滴雨，光照还是严寒，我的生命已缓慢地缩进最幽闭最深邃的内部。它不死。它等待。', thought: '', page: null },
      { text: '我的问题依旧是：日后要做个好儿子、好公民，还是依我的本性走别的路。我试图在父宅的庇荫下获得精神上的幸福。我努力了许久，有时几近成功，最后却彻底失败。', thought: '', page: null },
      { text: '是追逐本心还是向世俗妥协，是黑塞作品里永恒的矛盾，理想与现实的隔阂，追求自我与标准化成长矛盾，不断地挖掘自己内心的声音，充满了痛苦和阻隔，最后往往只能从容赴死。', thought: '整理者注：是追逐本心还是向世俗妥协，是黑塞作品里永恒的矛盾。', page: null },
      { text: '已习惯一边散步，一边沉浸在思绪中，无论刮风下雨。我享受散步的畅快。那是饱含忧郁、饱含藐视世界也藐视自我的畅快。', thought: '', page: null },
      { text: '但很快，初尝酒精就让我喋喋不休。我似乎突然打开心门，拥抱整个世界——多久了，我已多久没向人诉说衷肠！', thought: '', page: null },
      { text: '当他称我是个天才混蛋时，我的灵魂就像注入了甘甜的烈酒。世界焕发的全新神采在我眼中发光。我的思绪从上百口活跃的泉眼中一喷而出。精神的火焰在我身上燃烧。', thought: '', page: null },
      { text: '喝醉是造反，是狂欢，是生命和灵魂！', thought: '', page: null },
      { text: '酣睡半晌后，我从疼痛中醒来，清醒着，被幻灭的苦楚包围。', thought: '', page: null },
      { text: '一切，这一切——我知道——昨天，或许几小时前还属于我，恭候我，而现在，就在这沉沦时刻，它们已抛下我，厌弃地看着我。我不再拥有它们！', thought: '这一刻，你只需存在，不必升华！', page: null },
      { text: '越是在伙伴中不断地感到孤独，我越是离不开他们。', thought: '', page: null },
      { text: '上帝预备了许多让人深陷孤独，走向自我的道路。', thought: '', page: null },
      { text: '有时我这么想：假如这个世界不需要我这样的人，没给我预备更好的位置、指派更高的职责，那我只能自我毁灭。损失该由这个世界承担。', thought: '', page: null },
      { text: '我逐渐产生一种感觉，这幅画既不是贝雅特丽齐，也不是德米安，而是——我自己。它并不像我——也不必像我——但它是我生活的映像，是我的心，我的命运，我的魔鬼。如果我能找到一个朋友或爱人，那么它就是我的朋友、我的爱人的样子。它是我生死的模样，是我命运的声音和节奏。', thought: '', page: null },
      { text: '"在我们心中，住着一个无所不知、无所不求的人。他所做的一切远比我们自己做得更好。"', thought: '', page: null },
      { text: '他们对人性的界定太过狭隘！我们从个人与他者的差异中辨识个性，但我们是由世界的全部构成。我们每个人肉身进化的谱系，都可追溯到鱼，甚至追溯得更远。因此，我们的灵魂中包含了曾经居住过人类灵魂中的一切。', thought: '', page: null },
      { text: '何种命运，何种苦难，此刻都与我无关。我存在，我渴望，我满足。这就够了。', thought: '', page: null },
      { text: '比照他人，我时常骄傲自负，又时常垂头丧气，倍感屈辱。我视自己为天才，也视自己为半疯。', thought: '', page: null },
      { text: '假如我们恨一个人，我们不过是借他的形象，恨我们自身的某些东西。那些不在我们自身的东西，从不会激怒我们。', thought: '', page: null },
      { text: '大部分人活得并不真实。因为他们视外部世界为真实存在，却无视其自身的内部世界。', thought: '', page: null },
      { text: '我射中他心脏的箭，恰恰取自他自己的军械库——我将时常从他口气中听到的自嘲，恶毒而尖锐地掷向他。', thought: '', page: null },
      { text: '火萎了，渐渐熄灭。在每簇噼啪作响的火光中，我都看见一些美好而深刻的事物灰飞烟灭，永不复来。', thought: '', page: null },
      { text: '一种认知宛如烈火，顷刻燃烧我——人人拥有自己的"职责"，但没人能选择、再造或任意掌管自己的"职责"。', thought: '', page: null },
      { text: '一个觉醒的人，只有一个任何义务也无法超越的义务：寻找自我，固化自我，摸索自己的路前行，无论去向何方。', thought: '', page: null },
      { text: '我来，不为写诗，不为预言，不为作画。不仅是我，任何人都不为此而来。成为什么，不过是存在的附属。人只有一个使命：走向自我。', thought: '', page: null },
      { text: '他的职责是发现自己的命运，不是别人的命运，是彻底而不屈地活出自己的命运。其他任何道路都不完整，都是企图逃避，是遁入公众的轨迹，是苟且偷生，是对内心的恐惧。', thought: '', page: null },
      { text: '人们到处结社，到处聚集，到处推脱命运，到处是遁入温暖的乌合之众！', thought: '', page: null },
      { text: '人只有在无法认同自身时才会感到害怕。他们害怕，因为他们从不认识自己。一群因为对自身的无知而深感恐慌的人结成联盟！', thought: '', page: null },
      { text: '人们在记忆中到处寻找"自由"和"幸福"，因为他们害怕想起个人的责任，想起自己的道路。', thought: '', page: null },
      { text: '她的声音深沉温柔。我吞下这声音，如同吞下甘甜的酒。', thought: '', page: null },
      { text: '对他们来说，人性——他们和我们同样热爱的人性——是完善的，需要被保存、保护。对我们来说，人性是遥远的未来，我们仍在路上摸索。人性的面目无人知晓。人性的法则无踪可循。', thought: '', page: null },
      { text: '人类迄今拥有的全部理想，都来自潜意识的精神之梦。', thought: '', page: null },
      { text: '我们只将其视为职责和命运：我们中的每个人，都要完全成为自己，都要与萌生于自身的天然属性密切相合，都要听从和接受未知的未来为我们做出的安排。', thought: '', page: null },
      { text: '过去我曾想，为什么少有人愿意为理想而活。现在我却发现，许多人、甚至所有人都愿意为理想去死。不是为个人的、自由的、深思熟虑的理想，而是为集体的理想，被授予的理想。', thought: '', page: null },
      { text: '而世界越是执迷于战争、英勇、荣誉和一切古老的理想，虚伪的人道之声就愈发遥远，愈发难以置信。', thought: '', page: null },
      { text: '伤口很痛。打那以后发生的一切都很痛。但偶尔我会找到钥匙，沉入心底。在那里，命运的意象沉睡在黑暗的镜中。只要我俯身望向那面黑镜，就能看见我自己。我和他一模一样。他，我的朋友，我的领路人。', thought: '', page: null },
    ];

    const todayStr = now.slice(0, 10);
    const addQuoteTx = db.transaction('quotes', 'readwrite');
    const quoteStore = addQuoteTx.objectStore('quotes');
    let addedCount = 0;

    for (const q of allQuotes) {
      const quote = {
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${addedCount}`,
        bookId: bookId,
        text: q.text,
        thought: q.thought,
        page: q.page,
        date: todayStr,
        createdAt: now,
        updatedAt: now,
      };
      await new Promise((resolve, reject) => {
        const req = quoteStore.add(quote);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      addedCount++;
    }
    addQuoteTx.commit();

    console.log(`✅ 已导入 ${addedCount} 条摘录`);
    console.log('🎉 《德米安》导入完成！请刷新页面查看。');
  } catch (err) {
    console.error('❌ 导入失败：', err);
  }
})();
