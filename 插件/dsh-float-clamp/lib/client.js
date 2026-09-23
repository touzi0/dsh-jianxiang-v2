/**
 * 浮窗回界（dsh-float-clamp，浏览器半边）。
 *
 * 产物格式：官方 client-modules 要求的 `window.__ModuleLoader__.load` CJS 工厂
 * 包装（裸 ESM 会被加载器拒绝，导致整页 Failed to load plugins——首版教训）。
 * 无任何外部 require（纯 DOM 修补，不依赖 react / 工作区包）。
 *
 * 背景：右侧栏（dockkit）的浮窗拖拽落点计算（movedRect）不做任何视口钳制，
 * 浮窗可以被拖出视口——尤其往上方拖出后，标题栏（唯一的移动/收回/关闭区）
 * 完全不可见，浮窗既拖不回来也关不掉；该矩形还会随布局持久化到
 * localStorage，刷新后依旧卡死。
 *
 * 修复方式：不改官方状态，只在渲染层叠加一个平移量——官方组件用 left/top
 * 定位浮窗，模组给 [data-dockkit-float] 元素补一个 transform: translate(dx, dy)，
 * 把超出视口的边缘拉回界内。React 后续重写 left/top 不会清掉 transform（两者
 * 属性不同、互不覆盖），每次状态/尺寸变化后重新计算即可；拖拽预览期间
 * transform 保持不变，视觉与手势一致。标题栏因此永远在视口内，
 * 「收回侧栏 / 关闭 / 继续拖动」全部恢复可用。
 *
 * 触发源：body 级 MutationObserver（挂载/卸载/style 写入）+ 窗口 resize
 * + 500ms 轮询兜底（内嵌浏览器与节流环境下观察器可能丢事件），rAF 合帧。
 */
window.__ModuleLoader__.load({ id: "dsh-float-clamp", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

/** 需要的服务：无（纯 DOM 修补，不注入任何服务）。 */
const inject = [];

/**
 * 把一维坐标钳回界内：放得下就整体收进 [0, extent]；放不下就居中。
 * @param {number} pos 面板当前的 left 或 top（视口坐标）。
 * @param {number} extent 视口在该轴的尺寸。
 * @param {number} size 面板在该轴的尺寸。
 * @returns {number} 需要平移的像素量。
 */
function clampAxis(pos, extent, size) {
	if (size <= 0 || extent <= 0) return 0;
	if (size >= extent) return (extent - size) / 2 - pos;
	if (pos < 0) return -pos;
	if (pos + size > extent) return extent - size - pos;
	return 0;
}

/**
 * 对当前页面上所有 dockkit 浮窗做一次回界钳制。
 * 只读写 transform；left/top/width/height 归官方组件所有。
 */
function clampAll() {
	const panels = document.querySelectorAll("[data-dockkit-float]");
	if (panels.length === 0) return;
	const vw = window.innerWidth;
	const vh = window.innerHeight;
	for (const panel of panels) {
		const left = Number.parseFloat(panel.style.left);
		const top = Number.parseFloat(panel.style.top);
		// 首帧 style 尚未写入时跳过，等下一次触发再算。
		if (!Number.isFinite(left) || !Number.isFinite(top)) continue;
		const dx = clampAxis(left, vw, panel.offsetWidth);
		const dy = clampAxis(top, vh, panel.offsetHeight);
		const next = dx === 0 && dy === 0 ? "" : `translate(${dx}px, ${dy}px)`;
		if (panel.style.transform !== next) panel.style.transform = next;
	}
}

/** @param {import("@deepseek-ai/cordis").Context} ctx */
function apply(ctx) {
	ctx.effect(() => {
		let rafId = 0;
		let timer = 0;
		let observer = null;

		const run = () => {
			rafId = 0;
			clampAll();
		};

		/** rAF 合帧 + 150ms 超时兜底（后台/节流窗口里 rAF 可能长期不触发）。 */
		const schedule = () => {
			if (rafId !== 0) return;
			let ran = false;
			const fire = () => {
				if (ran) return;
				ran = true;
				clearTimeout(fallback);
				run();
			};
			const fallback = setTimeout(fire, 150);
			rafId = requestAnimationFrame(fire);
		};

		/** 观察 body；apply 早于 body 就绪时（预载入窗口）轮询等待。 */
		const observe = () => {
			if (observer !== null || document.body === null) return;
			observer = new MutationObserver(schedule);
			observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });
		};
		observe();
		window.addEventListener("resize", schedule);
		// 轮询兜底：观察器在任何环境下都可能丢事件；500ms 轻探一次，
		// 兼顾 body 迟迟未就绪的情况。
		timer = setInterval(() => {
			observe();
			schedule();
		}, 500);
		schedule();

		return () => {
			clearInterval(timer);
			if (rafId !== 0) cancelAnimationFrame(rafId);
			window.removeEventListener("resize", schedule);
			if (observer !== null) observer.disconnect();
			// 卸载时移除本模组写入的平移，恢复官方原位。
			for (const panel of document.querySelectorAll("[data-dockkit-float]")) {
				if (panel.style.transform === "") continue;
				panel.style.transform = "";
			}
		};
	}, "dsh-float-clamp: viewport clamp loop");
}
exports.apply = apply;
exports.inject = inject;

return module.exports; } });
