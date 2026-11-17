// Marina Club Rush — 視覺導向自動遊玩模式（JS 層合成輸入）
// 成品為編譯後的 Unity WebGL，未暴露內部狀態 API；此模組讀取 WebGL canvas 像素，
// 以顏色分簇找出畫面上的魚群（淺白/淡青）與玩家錨點，再合成 WASD／方向鍵導向。
// 不更動 Build/ 內的 wasm/data。預設關閉，可由左上角按鈕或 window.MarinaAutopilot 切換。
(function () {
	'use strict';

	// 每個方向同時對應 WASD 與方向鍵，涵蓋 Unity 輸入軸的兩種綁定。
	var DIRS = {
		up:    { codes: ['KeyW', 'ArrowUp'],    keys: ['w', 'ArrowUp'],    codesNum: [87, 38] },
		down:  { codes: ['KeyS', 'ArrowDown'],  keys: ['s', 'ArrowDown'],  codesNum: [83, 40] },
		left:  { codes: ['KeyA', 'ArrowLeft'],  keys: ['a', 'ArrowLeft'],  codesNum: [65, 37] },
		right: { codes: ['KeyD', 'ArrowRight'], keys: ['d', 'ArrowRight'], codesNum: [68, 39] }
	};
	var ORDER = ['up', 'left', 'down', 'right'];

	var TICK = 160;              // 視覺取樣間距（毫秒）
	var DEAD = 20;               // 視覺上「已貼近」的半徑（像素）
	var STEP = 3;                // 像素取樣間距（降採樣）
	var LOST_LIMIT = 5;          // 連續幾幀找不到魚群就改用巡邏兜底

	var active = false;
	var current = {};            // 目前按住的方向
	var timer = null;
	var lostTicks = 0;
	var fallbackDir = null;
	var fallbackTimer = null;
	var lastPlayer = { x: 420, y: 205 };
	var hist = [];               // 玩家錨點移動軌跡，用來偵測卡住

	// 離線 DOM／快取
	var off = null;              // 2D 離屏 canvas
	var offCtx = null;
	var overlay = null;
	var octx = null;
	var debug = false;

	function fire(type, dir) {
		var d = DIRS[dir];
		for (var i = 0; i < d.codes.length; i++) {
			window.dispatchEvent(new KeyboardEvent(type, {
				code: d.codes[i],
				key: d.keys[i],
				keyCode: d.codesNum[i],
				which: d.codesNum[i],
				bubbles: true,
				cancelable: true
			}));
		}
	}

	function press(dir) { if (!current[dir]) { fire('keydown', dir); current[dir] = true; } }
	function release(dir) { if (current[dir]) { fire('keyup', dir); delete current[dir]; } }
	function stopAll() { Object.keys(current).forEach(release); }

	function getGameCanvas() {
		var host = document.getElementById('game');
		var cvs = host && host.querySelector('canvas');
		if (!cvs) cvs = document.querySelector('canvas');
		return cvs || null;
	}

	// 區域排除：中央頂部計數面板、左側標籤、右側計數欄、左下按鈕／虛擬方向鍵、中央教學圖示
	function inExcluded(x, y, W, H) {
		if (x >= 360 && x <= 580 && y < 130) return true;   // 星星＋0/1 黑色面板
		if (x < 170 && y < 200) return true;                 // 左側 FISHING 標籤
		if (x > 878) return true;                           // 右側魚／龍蝦／背包計數欄
		if (x < 170 && y > 400) return true;                // 左下船隻按鈕
		if (x < 410 && y > 420) return true;                 // 虛擬方向鍵
		if (x >= 528 && x <= 642 && y >= 438 && y <= 512) return true;
		return false;
	}

	function isPale(r, g, b)   { return r >= 220 && g >= 225 && b >= 230; }
	function isOrange(r, g, b) { return r >= 200 && g >= 120 && g <= 205 && b <= 120; }
	function isBrown(r, g, b)   { return r < 150 && g < 120 && b < 120 && r >= g - 10; }
	function isWater(r, g, b)  { return b >= 180 && b > g + 10 && b >= r + 25; }

	// 讀取畫面並做成分簇，回傳 { player, fishes, W, H }
	function readScene() {
		var cvs = getGameCanvas();
		if (!cvs || !cvs.width) return null;
		if (!off) {
			off = document.createElement('canvas');
			offCtx = off.getContext('2d', { willReadFrequently: true });
		}
		off.width = cvs.width; off.height = cvs.height;
		offCtx.drawImage(cvs, 0, 0);
		var img;
		try { img = offCtx.getImageData(0, 0, off.width, off.height).data; }
		catch (e) { return null; }

		var W = off.width, H = off.height;
		var seen = new Uint8Array(W * H);
		var fishes = [];
		var px = 0, py = 0, pn = 0;   // 玩家錨點（白衣／橙髮）
		var ox = 0, oy = 0, on = 0;   // 橙髮候選

		for (var y = 0; y < H; y += STEP) {
			for (var x = 0; x < W; x += STEP) {
				var i = (y * W + x) * 4;
				var r = img[i], g = img[i + 1], b = img[i + 2];
				if (isOrange(r, g, b) && x > 360 && x < 500 && y > 185 && y < 255) {
					ox += x; oy += y; on++;
				}
				if (inExcluded(x, y, W, H)) continue;
				if (!isPale(r, g, b)) continue;

				var idx = y * W + x;
				if (seen[idx]) continue;
				// 洪水填充一個淺白簇
				var stack = [[x, y]];
				seen[idx] = 1;
				var sx = 0, sy = 0, n = 0;
				var minx = x, maxx = x, miny = y, maxy = y;
				while (stack.length) {
					var cur = stack.pop(), cx = cur[0], cy = cur[1];
					sx += cx; sy += cy; n++;
					if (cx < minx) minx = cx; if (cx > maxx) maxx = cx;
					if (cy < miny) miny = cy; if (cy > maxy) maxy = cy;
					for (var k = 0; k < 4; k++) {
						var nx = cx + [1, -1, 0, 0][k] * STEP;
						var ny = cy + [0, 0, 1, -1][k] * STEP;
						if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
						if (inExcluded(nx, ny, W, H)) continue;
						var ni = ny * W + nx;
						if (seen[ni]) continue;
						var ii = (ny * W + nx) * 4;
						if (!isPale(img[ii], img[ii + 1], img[ii + 2])) continue;
						seen[ni] = 1;
						stack.push([nx, ny]);
					}
				}
				if (n < 3 || n > 80) continue;    // 太小的雜點與過大的 UI／地磚區塊都排除
				var bw = maxx - minx + STEP, bh = maxy - miny + STEP;
				if (bh < 2 || bw > 24 || bw / bh < 2.0) continue;  // 魚是細長橢圓，過濾方形地磚／泡沫團
				var c = sx / n, cy2 = sy / n;
				if (waterRatio(img, W, c, cy2) < 0.7) continue;   // 非水面上的白色區塊（石頭泡沫／碼頭／貨籃）
				// 玩家身上的白衣簇不當魚
				if (c > 360 && c < 500 && cy2 > 185 && cy2 < 255) {
					px += c; py += cy2; pn++;
					continue;
				}
				fishes.push({ x: c, y: cy2, n: n });
			}
		}

		var player = on > 0 ? { x: ox / on, y: oy / on } : (pn > 0 ? { x: px / pn, y: py / pn } : null);
		if (player) lastPlayer = player;
		else player = lastPlayer;

		return { player: player, fishes: fishes, W: W, H: H };
	}

	// 簇四周是否主要是水面：過濾掉貼著石頭泡沫、碼頭邊、貨籃的白色區塊
	function waterRatio(img, W, cx, cy) {
		var total = 0, water = 0;
		for (var dy = -16; dy <= 16; dy += 8) {
			for (var dx = -16; dx <= 16; dx += 8) {
				var x = Math.round(cx + dx), y = Math.round(cy + dy);
				if (x < 0 || x >= W || y < 0 || y >= off.height) continue;
				var i = (y * W + x) * 4;
				total++;
				if (isWater(img[i], img[i + 1], img[i + 2])) water++;
			}
		}
		return total ? water / total : 0;
	}

	function nearestFish(scene) {
		if (!scene.fishes.length) return null;
		var p = scene.player;
		var best = null, bd = Infinity;
		scene.fishes.forEach(function (f) {
			var d = Math.hypot(f.x - p.x, f.y - p.y);
			if (d < bd) { bd = d; best = f; }
		});
		return best;
	}

	function steer(target, player) {
		var dx = target.x - player.x;
		var dy = target.y - player.y;
		var want = {};
		if (Math.abs(dx) > DEAD) want[dx > 0 ? 'right' : 'left'] = true;
		if (Math.abs(dy) > DEAD) want[dy > 0 ? 'down' : 'up'] = true;
		ORDER.forEach(function (dir) {
			if (want[dir]) press(dir); else release(dir);
		});
	}

	function patrolSegment() {
		var d = ORDER[Math.floor(Math.random() * ORDER.length)];
		if (d !== fallbackDir) { release(fallbackDir); fallbackDir = d; press(d); }
		fallbackTimer = setTimeout(patrolSegment, 1200 + Math.random() * 1000);
	}

	function tick() {
		if (!active) return;
		var scene = readScene();
		var target = scene ? nearestFish(scene) : null;

		if (target) {
			lostTicks = 0;
			clearTimeout(fallbackTimer);
			fallbackDir = null;
			steer(target, scene.player);
			// 卡住偵測：4 秒內錨點幾乎沒位移就改隨機巡邏一段
			hist.push({ x: scene.player.x, y: scene.player.y, t: Date.now() });
			while (hist.length && hist[0].t < Date.now() - 4000) hist.shift();
			if (hist.length >= 8) {
				var a = hist[0], b = hist[hist.length - 1];
				if (Math.hypot(b.x - a.x, b.y - a.y) < 8) {
					stopAll();
					hist = [];
					lostTicks = LOST_LIMIT;
					patrolSegment();
				}
			}
		} else {
			hist = [];
			lostTicks++;
			if (lostTicks === LOST_LIMIT) {
				stopAll();
				patrolSegment();
			}
		}

		drawOverlay(scene, target);
		timer = setTimeout(tick, TICK);
	}

	// 除錯疊層：玩家綠點、目標紅點、其餘魚群藍點
	function ensureOverlay(W, H) {
		if (!overlay) {
			overlay = document.createElement('canvas');
			overlay.id = 'marina-autopilot-overlay';
			overlay.style.cssText = 'position:absolute;inset:0;z-index:20;pointer-events:none;';
			var host = document.getElementById('game-container') || document.body;
			host.appendChild(overlay);
			octx = overlay.getContext('2d');
		}
		overlay.width = W; overlay.height = H;
		overlay.style.width = '100%'; overlay.style.height = '100%';
	}

	function drawOverlay(scene, target) {
		if (!debug) { if (overlay) overlay.style.display = 'none'; return; }
		if (!scene) return;
		ensureOverlay(scene.W, scene.H);
		overlay.style.display = 'block';
		octx.clearRect(0, 0, overlay.width, overlay.height);
		octx.lineWidth = 2;
		scene.fishes.forEach(function (f) {
			octx.fillStyle = 'rgba(80,170,255,.85)';
			octx.beginPath(); octx.arc(f.x, f.y, 5, 0, Math.PI * 2); octx.fill();
		});
		if (target) {
			octx.fillStyle = 'rgba(255,80,80,.95)';
			octx.beginPath(); octx.arc(target.x, target.y, 8, 0, Math.PI * 2); octx.fill();
		}
		octx.fillStyle = 'rgba(80,230,140,.95)';
		octx.beginPath(); octx.arc(scene.player.x, scene.player.y, 8, 0, Math.PI * 2); octx.fill();
	}

	function enable() {
		if (active) return;
		active = true;
		lostTicks = 0;
		tick();
		render();
	}

	function disable() {
		active = false;
		clearTimeout(timer);
		clearTimeout(fallbackTimer);
		fallbackDir = null;
		hist = [];
		stopAll();
		if (overlay) overlay.style.display = 'none';
		render();
	}

	function toggle() { active ? disable() : enable(); }

	// 左上角切換按鈕
	var btn = document.createElement('button');
	btn.id = 'marina-autopilot';
	btn.type = 'button';
	btn.textContent = 'Auto: Off';
	btn.style.cssText = 'position:fixed;top:12px;left:12px;z-index:30;padding:8px 14px;border-radius:10px;border:1px solid rgba(190,220,230,.35);background:rgba(16,34,46,.6);color:#cfe3ea;font:600 14px system-ui,sans-serif;cursor:pointer;touch-action:manipulation;';

	function render() {
		btn.textContent = active ? 'Auto: On' : 'Auto: Off';
		btn.style.background = active ? 'rgba(46,110,80,.75)' : 'rgba(16,34,46,.6)';
	}

	btn.addEventListener('click', function () { toggle(); btn.blur(); });
	if (document.body) document.body.appendChild(btn);
	else window.addEventListener('load', function () { document.body.appendChild(btn); });

	window.MarinaAutopilot = {
		toggle: toggle,
		enable: enable,
		disable: disable,
		isActive: function () { return active; },
		setDebug: function (v) { debug = !!v; if (!debug && overlay) overlay.style.display = 'none'; },
		getDebug: function () { return debug; },
		// 供除錯檢視目前畫面解析結果
		inspect: function () { return readScene(); }
	};
})();
