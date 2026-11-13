import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const playwright = process.env.PLAYWRIGHT_MODULE || (process.platform === 'win32' && process.env.APPDATA
    ? path.join(process.env.APPDATA, 'npm', 'node_modules', 'playwright') : 'playwright');
const { chromium } = require(playwright);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const map = { id: 'qa-mindmap-stability', kind: 'mindmap', title: 'QA Layout', sceneKey: 'mindmaps/a1.json' };
const large = { ...map, id: 'qa-mindmap-large', title: 'QA Large', sceneKey: 'mindmaps/a2.json' };
const unfold = { ...map, id: 'qa-mindmap-unfold', title: 'QA Folded Layout', sceneKey: 'mindmaps/a3.json' };
const topic = (id, title, parentId, order, x, y, data = {}) => [
    { id, type: 'rectangle', x, y, width: 200, height: 68, customData: { mindmap: { parentId, order, ...data } } },
    { id: 'label-' + id, type: 'text', x, y, width: 180, height: 34, containerId: id, originalText: title },
];
const fixture = { files: {}, appState: { mindmapOrientation: 'horizontal' }, elements: [
    ...topic('root', 'Center', null, 0, 80, 250),
    ...topic('a', 'Branch A', 'root', 1, 400, 100),
    ...topic('b', 'Branch B', 'root', 2, 400, 400),
    ...topic('a1', 'Hidden Experiment', 'a', 3, 720, 100, { notes: 'Boundary Token', tags: ['时序'], recordId: 'exp-042' }),
] };
const largeFixture = { ...fixture, elements: [
    ...topic('root', 'Large Center', null, 0, 0, 0),
    ...Array.from({ length: 800 }, (_, i) => topic('large-' + i, 'Topic ' + i, i < 8 ? 'root' : 'large-' + Math.floor((i - 8) / 8), i + 1, 320 * (1 + i % 8), i * 100)).flat(),
] };
const unfoldFixture = { ...fixture, elements: [
    ...topic('root', '连续事件状态与分层记忆', null, 0, 300, 150),
    ...topic('left', '旧在线事件链的根因排查', 'root', 1, 20, 100),
    ...topic('left2', 'v2.5 证据累计与候选过滤', 'root', 2, 20, 210),
    ...topic('right', '分层记忆与雷达语言接口', 'root', 3, 580, 150, { collapsed: true, positionLocked: true }),
    ...topic('peer', 'v2.6 预测驱动与 HARrad 重训', 'root', 4, 580, 260, { collapsed: true, positionLocked: true }),
    ...topic('peer2', '架构起点与数据适配', 'root', 5, 580, 370),
    ...['Stage4 分层记忆首轮', '聊天 QA 到单事件 QA', '压缩与事件编号假设', '时间 QA 前置门槛与解码修复', 'Reader 融合与语义对齐']
        .flatMap((title, i) => topic('branch-' + i, title, 'right', i + 6, 1150, 500 + i * 110)),
    ...Array.from({ length: 13 }, (_, i) => topic('peer-' + i, 'v2.6 实验 ' + (i + 1), 'peer', i + 11, 1150, 1060 + i * 110)).flat(),
] };
try {
    const page = await browser.newPage({ viewport: { width: 1450, height: 1000 }, acceptDownloads: true });
    const errors = [];
    await page.addInitScript(() => {
        window.qaWorker = [];
        const NativeWorker = window.Worker;
        window.Worker = class extends NativeWorker {
            constructor(url, options) {
                window.qaWorker.push({ event: 'start', url: String(url) });
                super(url, options);
                this.addEventListener('error', e => window.qaWorker.push({ event: 'error', message: e.message }));
                this.addEventListener('message', e => window.qaWorker.push({ event: 'message', error: e.data.error }));
            }
        };
    });
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/records*', route => {
        assert.equal(route.request().method(), 'GET');
        return route.fulfill({ json: [map, large, unfold] });
    });
    await page.route('**/api/mindmap-scenes*', route => {
        if (route.request().method() === 'POST') return route.fulfill({ status: 503, json: { error: 'QA offline' } });
        return route.fulfill({ json: route.request().url().includes('a2.json') ? largeFixture : route.request().url().includes('a3.json') ? unfoldFixture : fixture });
    });
    await page.goto((process.env.MINDMAP_QA_URL || 'http://127.0.0.1:5173') + '/#mindmaps');
    await page.locator('.map-open').filter({ hasText: map.title }).click();
    const card = id => page.locator('[data-topic-id="' + id + '"] .map-topic-card');
    const hit = id => page.locator('[data-topic-id="' + id + '"]');
    await card('a1').waitFor();
    await page.waitForTimeout(180);
    const coordinate = async id => { const b = await card(id).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    const drag = async (from, to, pause) => {
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(to.x, to.y, { steps: 8 });
        if (pause) await page.locator('.map-drop-preview').waitFor({ state: 'attached' });
        await page.mouse.up();
    };
    await drag(await coordinate('a1'), await coordinate('b'), false);
    assert.equal(await page.locator('[data-topic-id="a1"] foreignObject').getAttribute('y'), '100');
    await drag(await coordinate('a1'), await coordinate('b'), true);
    const moved = await page.locator('[data-topic-id="a1"] foreignObject').getAttribute('y');
    assert.notEqual(moved, '100');
    await page.keyboard.press('Control+z');
    assert.equal(await page.locator('[data-topic-id="a1"] foreignObject').getAttribute('y'), '100');

    await page.getByRole('button', { name: '折叠Branch A', exact: true }).click();
    assert.equal(await hit('a1').count(), 0);
    await page.keyboard.press('Control+f');
    await page.getByRole('textbox', { name: '搜索标题、笔记、标签或实验编号' }).fill('EXP-042');
    await page.getByRole('button', { name: /Hidden Experiment/ }).click();
    await hit('a1').waitFor();
    assert.equal(await hit('a1').getAttribute('aria-pressed'), 'true');

    await page.keyboard.press('Space');
    const edit = page.getByRole('textbox', { name: '编辑主题文本' });
    await edit.waitFor();
    await edit.fill('恢复前的实验');
    await edit.dispatchEvent('compositionstart');
    await edit.press('Enter');
    assert(await edit.isVisible(), 'IME Enter closed the inline editor');
    await edit.dispatchEvent('compositionend');
    await edit.press('Control+ArrowLeft');
    assert.equal(await edit.evaluate(el => el.selectionStart), 0);
    await edit.press('End');
    assert.equal(await edit.evaluate(el => el.selectionStart), '恢复前的实验'.length);
    await edit.press('Enter');
    assert.match(await hit('a1').getAttribute('aria-label'), /恢复前的实验/);
    await page.getByRole('button', { name: '小地图', exact: true }).click();
    await page.getByRole('img', { name: '小地图视口' }).waitFor();

    const title = page.getByRole('textbox', { name: '思维导图标题', exact: true });
    await title.fill('未同步的导图标题');
    await page.waitForFunction(async id => {
        const db = await new Promise(resolve => { const request = indexedDB.open('seer-mindmap-drafts'); request.onsuccess = () => resolve(request.result); });
        const draft = await new Promise(resolve => { const request = db.transaction('drafts').objectStore('drafts').get(id); request.onsuccess = () => resolve(request.result); });
        db.close();
        return draft?.title === '未同步的导图标题' && draft.scene.elements.some(e => e.originalText === '恢复前的实验');
    }, map.id);
    // Navigate immediately after the durable local transaction, then verify offline recovery.
    await page.reload();
    await page.locator('.map-open').filter({ hasText: map.title }).click();
    await page.getByText('已恢复本机草稿', { exact: true }).waitFor();
    assert.equal(await title.inputValue(), '未同步的导图标题');
    await page.getByRole('button', { name: '← 全部导图' }).click();

    await page.locator('.map-open').filter({ hasText: unfold.title }).click();
    const toggle = page.getByRole('button', { name: '展开分层记忆与雷达语言接口', exact: true });
    await toggle.waitFor();
    const world = async id => hit(id).locator('foreignObject').evaluate(el => Object.fromEntries(
        ['x', 'y', 'width', 'height'].map(key => [key, Number(el.getAttribute(key))])));
    const parent = await world('right'), peer = await world('peer');
    await toggle.click();
    await hit('branch-0').waitFor();
    const first = await world('branch-0'), last = await world('branch-4');
    assert.equal(first.x, last.x);
    assert(first.x - parent.x - parent.width <= 84, 'Expanded child column is still too far from its parent');
    assert.equal((first.y + last.y + last.height) / 2, parent.y + parent.height / 2);
    assert.deepEqual(await world('right'), parent);
    assert.deepEqual(await world('peer'), peer);
    await page.getByRole('button', { name: '适应画布', exact: true }).click();
    const rootBefore = await world('root'), leftBefore = await world('left');
    await page.getByRole('button', { name: '展开v2.6 预测驱动与 HARrad 重训', exact: true }).click();
    await page.getByRole('button', { name: '适应画布', exact: true }).click();
    const upper = await world('right'), lower = await world('peer');
    const a0 = await world('branch-0'), a4 = await world('branch-4'), b0 = await world('peer-0'), b12 = await world('peer-12');
    assert.equal((a0.y + a4.y + a4.height) / 2, upper.y + upper.height / 2);
    assert.equal((b0.y + b12.y + b12.height) / 2, lower.y + lower.height / 2);
    assert(a4.y + a4.height < b0.y);
    assert(lower.y - upper.y > peer.y - parent.y);
    assert.equal(upper.x, parent.x);
    assert.equal(lower.x, peer.x);
    assert.deepEqual(await world('root'), rootBefore);
    assert.deepEqual(await world('left'), leftBefore);
    if (process.env.MINDMAP_QA_SCREENSHOT)
        await page.locator('.map-surface').screenshot({ path: process.env.MINDMAP_QA_SCREENSHOT });
    await page.getByRole('button', { name: '← 全部导图' }).click();

    await page.locator('.map-open').filter({ hasText: large.title }).click();
    await page.locator('.map-surface').waitFor();
    await page.getByRole('button', { name: '扩散布局', exact: true }).click();
    try {
        await page.waitForFunction(() => window.qaWorker.some(x => x.event === 'message' && !x.error), undefined, { timeout: 8000 });
    } catch (error) {
        throw Error('Layout worker did not return a result: ' + JSON.stringify(await page.evaluate(() => window.qaWorker)), { cause: error });
    }
    await page.waitForFunction(async id => {
        const db = await new Promise(resolve => { const request = indexedDB.open('seer-mindmap-drafts'); request.onsuccess = () => resolve(request.result); });
        const draft = await new Promise(resolve => { const request = db.transaction('drafts').objectStore('drafts').get(id); request.onsuccess = () => resolve(request.result); });
        db.close();
        const root = draft?.scene.elements.find(e => e.id === 'root');
        return root && root.x !== 0 && draft.scene.elements.some(e => e.customData?.mindmapEdge);
    }, large.id);
    assert(await page.locator('.map-topic').count() < 801, 'Viewport did not cull off-screen nodes');
    await page.getByRole('button', { name: '添加', exact: true }).click();
    await page.locator('.map-plus-menu details summary').click();
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '导出 SVG', exact: true }).click()]);
    const svg = await readFile(await file.path(), 'utf8');
    assert.equal((svg.match(/data-topic-id=/g) || []).length, 801);
    assert(!svg.includes('map-quick-child'), 'SVG included editing controls');
    assert.deepEqual(errors, []);
    console.log('Browser passed: drop dwell and undo, folded search, IME and text navigation, minimap, crash draft, centered sibling expansion, worker, viewport culling and full SVG.');
} finally {
    await browser.close();
}
