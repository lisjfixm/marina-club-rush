// Marina Club Rush — 自動遊玩模式（JS 層合成輸入）
// 成品為編譯後的 Unity WebGL，未暴露內部狀態 API；此模組透過合成鍵盤事件驅動角色移動，
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

	var active = false;
	var current = null;
	var timer = null;

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

	function release(dir) { if (dir) fire('keyup', dir); }
	function press(dir) { fire('keydown', dir); }

	function stopAll() {
		if (current) release(current);
		current = null;
	}

	function nextDir(prev) {
		if (!prev) return ORDER[Math.floor(Math.random() * ORDER.length)];
		var r = Math.random();
		var idx = ORDER.indexOf(prev);
		if (r < 0.55) return prev;                                   // 繼續直行
		if (r < 0.80) return ORDER[(idx + (Math.random() < 0.5 ? 1 : 3)) % 4]; // 左右轉
		return ORDER[(idx + 2) % 4];                                 // 迴轉
	}

	function segment() {
		var d = nextDir(current);
		if (d !== current) {
			release(current);
			current = d;
			press(d);
		}
		timer = setTimeout(segment, 1400 + Math.random() * 1200);
	}

	function enable() {
		if (active) return;
		active = true;
		segment();
		render();
	}

	function disable() {
		active = false;
		clearTimeout(timer);
		stopAll();
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
		isActive: function () { return active; }
	};
})();
