// ==UserScript==
// @name         王者荣耀热点收集器
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  自动从小红书和抖音收集王者荣耀相关热点（抖音3天2万赞，小红书3天1万赞）
// @author       You
// @match        https://www.xiaohongshu.com/*
// @match        https://www.douyin.com/*
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const KEYWORDS = [
        '王者荣耀', '峡谷', '打野', '上单', '射手', '辅助', '中单',
        '亚瑟', '妲己', '李白', '韩信', '孙悟空', '安琪拉', '鲁班',
        '铠', '兰陵王', '诸葛亮', '貂蝉', '虞姬', '后羿', '蔡文姬',
        '庄周', '大乔', '小乔', '孙尚香', '嬴政', '王昭君',
        '补刀', '拆塔', '抢龙', '偷家', 'gank', '开团',
        '一血', '五杀', 'MVP', '对线', '节奏', '野区',
        '上分', '下分', '掉分', '复活甲', '无尽', '破军',
        '回城', '泉水', '水晶', '推水晶', '队友', '猪队友', '带飞',
        '战令', '皮肤', '限定皮肤', '史诗皮肤', '传说皮肤',
    ];

    const STORAGE_KEY = 'wzry_memes_v2';
    const MAX_ITEMS = 500;
    const HOT_THRESHOLD = { '小红书': 10000, '抖音': 20000 };
    const HOT_DAYS = 3;

    // ==============================
    // 数据存取（直接用 localStorage，方便看板读取）
    // ==============================
    function getMemes() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
        catch { return []; }
    }

    function saveMemes(memes) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(memes));
    }

    // ==============================
    // 工具函数
    // ==============================
    function isWzryRelated(text) {
        if (!text) return false;
        return KEYWORDS.some(kw => text.toLowerCase().includes(kw.toLowerCase()));
    }

    function parseLikeCount(text) {
        if (!text) return 0;
        // 提取数字部分，兼容 "♡ 23.8万" "赞23.8万" "23.8万" "118" 等
        const match = text.match(/([\d.]+)\s*万/) || text.match(/([\d.]+)\s*[wW]/) || text.match(/(\d+)/);
        if (!match) return 0;
        const num = parseFloat(match[1]);
        if (/万|[wW]/.test(text)) return Math.round(num * 10000);
        return Math.round(num);
    }

    function isWithinDays(timeText, days) {
        if (!timeText) return true;
        const t = timeText.replace(/^[·\s]+/, '').trim();
        if (/刚刚|分钟前|小时前/.test(t)) return true;
        if (t.includes('昨天')) return days >= 1;
        if (t.includes('前天')) return days >= 2;
        const dayMatch = t.match(/(\d+)\s*天前/);
        if (dayMatch) return parseInt(dayMatch[1]) <= days;
        const dateMatch = t.match(/^(\d{1,2})-(\d{1,2})$/);
        if (dateMatch) {
            const now = new Date();
            const pub = new Date(now.getFullYear(), parseInt(dateMatch[1]) - 1, parseInt(dateMatch[2]));
            if (pub > now) pub.setFullYear(now.getFullYear() - 1);
            return Math.floor((now - pub) / 86400000) <= days;
        }
        if (/\d{4}/.test(t)) return false;
        return true;
    }

    function isHotEnough(meme) {
        const threshold = HOT_THRESHOLD[meme.source];
        if (!threshold) return true;
        if (meme.likes < threshold) return false;
        return isWithinDays(meme.publishTime, HOT_DAYS);
    }

    function extractTags(text) {
        return [...new Set(KEYWORDS.filter(kw => text.toLowerCase().includes(kw.toLowerCase())))].slice(0, 5);
    }

    function addMeme(meme) {
        if (!isHotEnough(meme)) return false;
        const memes = getMemes();
        const exists = memes.some(m =>
            (m.id && m.id === meme.id) ||
            (m.title === meme.title && m.source === meme.source)
        );
        if (exists) return false;
        meme.collectedAt = new Date().toISOString();
        meme.hotScore = meme.likes;
        memes.unshift(meme);
        if (memes.length > MAX_ITEMS) memes.splice(MAX_ITEMS);
        saveMemes(memes);
        return true;
    }

    // ==============================
    // 抖音解析
    // ==============================
    function parseDouyin() {
        document.querySelectorAll('.search-result-card').forEach(card => {
            try {
                // 注意：filter 长度改为 >1，避免过滤掉短数字如"118"
                const lines = (card.innerText || '').split('\n').map(l => l.trim()).filter(l => l.length > 1);

                // 找正文描述（排除纯数字/时间/点赞/作者行）
                const desc = lines.find(l =>
                    !/^[\d:万.·\s]+$/.test(l) &&
                    !/^[\d.]+万?$/.test(l) &&
                    !/天前|小时前|分钟前|刚刚|昨天|前天|\d{1,2}-\d{1,2}/.test(l) &&
                    !l.startsWith('@') &&
                    l.length > 8
                ) || '';
                if (!desc || !isWzryRelated(desc)) return;

                // 点赞数：兼容 "23.8万" "♡ 23.8万" "赞 23.8万" 等格式
                const likeLine = lines.find(l => /[\d.]+万/.test(l) || /^[\d]+$/.test(l.trim())) || '0';
                const likes = parseLikeCount(likeLine);

                // 发布时间：匹配含 · 前缀或直接时间文字的行
                const timeLine = lines.find(l =>
                    /天前|小时前|分钟前|刚刚|昨天|前天|\d{1,2}-\d{1,2}/.test(l)
                ) || '';

                // 关键：从父级 id="waterfall_item_XXXXXX" 提取视频ID
                const waterfallEl = card.closest('[id^="waterfall_item_"]');
                const videoId = waterfallEl?.id?.replace('waterfall_item_', '');
                const videoUrl = videoId
                    ? `https://www.douyin.com/video/${videoId}`
                    : location.href;

                const imgEl = card.querySelector('img');
                const authorLine = lines.find(l => l.startsWith('@')) || '';

                addMeme({
                    id: `dy_${videoId || Math.random().toString(36).slice(2)}`,
                    source: '抖音',
                    title: desc.slice(0, 120),
                    url: videoUrl,
                    cover: imgEl?.src || '',
                    author: authorLine.replace('@', '').trim() || '未知',
                    likes,
                    publishTime: timeLine,
                    tags: extractTags(desc),
                    type: card.innerText.includes('图文') ? 'post' : 'video',
                });
            } catch (e) { /* skip */ }
        });
    }

    // ==============================
    // 小红书解析
    // ==============================
    function parseXHS() {
        document.querySelectorAll('.note-item').forEach(card => {
            try {
                const lines = (card.innerText||'').split('\n').map(l=>l.trim()).filter(l=>l.length>1);
                // 标题是第一行有意义的文字
                const title = lines.find(l => l.length > 4 && !/^\d+$/.test(l)) || '';
                if (!title || !isWzryRelated(title)) return;

                // 链接：优先 /explore/ 开头的
                const allLinks = Array.from(card.querySelectorAll('a[href]'));
                const linkEl = allLinks.find(a => a.href.includes('/explore/'))
                    || allLinks.find(a => a.href.includes('xiaohongshu.com'));
                const url = linkEl?.href || location.href;

                // 封面图
                const imgEl = card.querySelector('img');

                // 点赞数：通常是纯数字行
                const likeLine = lines.find(l => /^[\d.]+[万]?$/.test(l.trim())) || '0';
                const likes = parseLikeCount(likeLine);

                // 时间：含"前"或"小时""天"的行
                const timeLine = lines.find(l =>
                    /天前|小时前|分钟前|刚刚|昨天|前天|\d{1,2}-\d{1,2}/.test(l)
                ) || '';

                // 作者：通常是第二行短文字
                const author = lines.find(l =>
                    l !== title &&
                    l.length < 20 &&
                    !/^\d+$/.test(l) &&
                    !/天前|小时前|分钟前/.test(l)
                ) || '未知';

                // 笔记ID
                const noteId = url.match(/\/explore\/(\w+)/)?.[1] || title.slice(0,10);

                addMeme({
                    id: `xhs_${noteId}`,
                    source: '小红书',
                    title,
                    url,
                    cover: imgEl?.src || '',
                    author,
                    likes,
                    publishTime: timeLine,
                    tags: extractTags(title),
                    type: 'post',
                });
            } catch (e) { /* skip */ }
        });
    }

    // ==============================
    // 扫描主逻辑
    // ==============================
    let newCount = 0;

    function scan() {
        const before = getMemes().length;
        if (location.hostname.includes('douyin')) parseDouyin();
        else if (location.hostname.includes('xiaohongshu')) parseXHS();
        const added = getMemes().length - before;
        if (added > 0) { newCount += added; updateBadge(); updatePanel(); }
    }

    function startScanning() {
        setTimeout(scan, 2000);
        setInterval(scan, 5000);
        const observer = new MutationObserver(() => {
            clearTimeout(window._wzryScanDebounce);
            window._wzryScanDebounce = setTimeout(scan, 800);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ==============================
    // UI
    // ==============================
    GM_addStyle(`
        #wzry-btn {
            position: fixed; bottom: 80px; right: 20px;
            width: 52px; height: 52px; border-radius: 50%;
            background: linear-gradient(135deg, #ff6b35, #f7c948);
            color: white; font-size: 22px;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; z-index: 99999;
            box-shadow: 0 4px 16px rgba(255,107,53,0.5);
            border: none; transition: transform 0.2s; font-family: sans-serif;
            position: fixed;
        }
        #wzry-btn:hover { transform: scale(1.1); }
        #wzry-badge {
            position: absolute; top: -4px; right: -4px;
            background: #ff2d55; color: white; font-size: 11px; font-weight: bold;
            border-radius: 10px; padding: 1px 5px; min-width: 18px;
            text-align: center; display: none;
        }
        #wzry-panel {
            position: fixed; bottom: 145px; right: 20px; width: 300px;
            background: #1a1a2e; border-radius: 12px; color: white;
            z-index: 99998; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            font-family: sans-serif; font-size: 13px; display: none; overflow: hidden;
        }
        #wzry-panel-header {
            background: linear-gradient(135deg, #ff6b35, #f7c948);
            padding: 10px 14px; font-weight: bold; font-size: 14px; color: #1a0a00;
        }
        #wzry-panel-body { padding: 12px 14px; }
        #wzry-panel-body p { margin: 4px 0; opacity: 0.85; }
        #wzry-panel-actions { display: flex; gap: 8px; margin-top: 10px; }
        .wzry-btn { flex: 1; padding: 6px; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: bold; }
        .wzry-btn-primary { background: #ff6b35; color: white; }
        .wzry-btn-secondary { background: #2d2d4e; color: #ccc; }
        #wzry-threshold { font-size: 11px; color: #f7c948; margin-top: 4px; }
    `);

    function createUI() {
        const btn = document.createElement('button');
        btn.id = 'wzry-btn';
        btn.innerHTML = '⚔️<span id="wzry-badge"></span>';

        const platform = location.hostname.includes('xiaohongshu') ? '🌸 小红书' : '🎵 抖音';
        const threshold = location.hostname.includes('xiaohongshu') ? '1万赞 / 3天内' : '2万赞 / 3天内';

        const panel = document.createElement('div');
        panel.id = 'wzry-panel';
        panel.innerHTML = `
            <div id="wzry-panel-header">⚔️ 王者热点收集器 v2</div>
            <div id="wzry-panel-body">
                <p id="wzry-total">已收集: 0 条热点</p>
                <p id="wzry-session">本次新增: 0 条</p>
                <p>平台: ${platform}</p>
                <p id="wzry-threshold">🔥 热度门槛: ${threshold}</p>
                <div id="wzry-panel-actions">
                    <button class="wzry-btn wzry-btn-primary" id="wzry-copy">📋 复制数据</button>
                    <button class="wzry-btn wzry-btn-secondary" id="wzry-clear">🗑 清空</button>
                </div>
            </div>
        `;

        document.body.appendChild(btn);
        document.body.appendChild(panel);

        btn.addEventListener('click', () => {
            panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
            updatePanel();
        });

        document.getElementById('wzry-copy').addEventListener('click', () => {
            const data = localStorage.getItem(STORAGE_KEY) || '[]';
            navigator.clipboard.writeText(data).then(() => {
                const copyBtn = document.getElementById('wzry-copy');
                copyBtn.textContent = '✅ 已复制！';
                setTimeout(() => { copyBtn.textContent = '📋 复制数据'; }, 2000);
            });
        });

        document.getElementById('wzry-clear').addEventListener('click', () => {
            if (confirm('确定清空所有热点吗？')) {
                saveMemes([]); newCount = 0; updateBadge(); updatePanel();
            }
        });

        updatePanel();
    }

    function updateBadge() {
        const badge = document.getElementById('wzry-badge');
        if (!badge) return;
        badge.style.display = newCount > 0 ? 'block' : 'none';
        badge.textContent = newCount > 99 ? '99+' : newCount;
    }

    function updatePanel() {
        const total = document.getElementById('wzry-total');
        const session = document.getElementById('wzry-session');
        if (total) total.textContent = `已收集: ${getMemes().length} 条热点`;
        if (session) session.textContent = `本次新增: ${newCount} 条`;
    }

    // ==============================
    // 初始化
    // ==============================
    window.addEventListener('load', () => {
        createUI();
        startScanning();
        setInterval(updatePanel, 3000);
    });

})();
