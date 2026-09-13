import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
//#region src/mods.ts
/**
* 坚祥模组扫描与补丁层生成（宿主侧纯 Node 逻辑）。
*
* 约定：插件\ 下每个子文件夹是一个模组包（package.json 必须存在）。
* 可选 jx 清单字段（写在模组 package.json 的 "jx" 键下）：
*   - description: string        展示用描述
*   - replaces: string[]         启用时要禁用的原生插件行 id
*   - defaultEnabled: boolean    未曾在设置页开关过时的默认状态（默认 true）
* 开关状态持久化在 插件\.jx-mods.json；补丁层写入 插件\.jx-mods.patch.yml。
*/
/** 运行时的本包目录（构建后为 lib/，与 src/ 同深度，两可）。 */
const SELF_DIR = dirname(fileURLToPath(import.meta.url));
/** 插件\ 根：环境变量优先，其次按包位置推导（lib/ 与 src/ 同深度）。 */
const MODS_ROOT = process.env.JX_MODS_ROOT?.trim() || resolve(SELF_DIR, "../..");
const STATE_FILE = join(MODS_ROOT, ".jx-mods.json");
const PATCH_FILE = join(MODS_ROOT, ".jx-mods.patch.yml");
/** 管理器自身的目录名（不出现在模组列表里）。 */
const SELF_PACKAGE = "dsh-mod-manager";
/** 读取开关状态文件（损坏或缺失时视为空）。 */
function readState() {
	try {
		const parsed = JSON.parse(readFileSync(STATE_FILE, "utf8"));
		if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
	} catch {}
	return {};
}
function writeState(state) {
	writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}
/** 解析 DSH home（与官方 resolveDshHome 同规则：$DSH_HOME 优先，缺省 ~/.dsh）。 */
function resolveDshHome() {
	const fromEnv = process.env.DSH_HOME;
	return resolve((fromEnv !== void 0 && fromEnv.trim().length > 0 ? fromEnv : join(homedir(), ".dsh")).replace(/^~(?![^/\\])/, homedir()));
}
/** 解析 config 里的 $dshHomePath 路径标记为绝对路径（其余值原样保留）。 */
function resolveConfigValues(config) {
	const resolved = {};
	for (const [key, value] of Object.entries(config)) if (value !== null && typeof value === "object" && !Array.isArray(value) && typeof value.$dshHomePath === "string") resolved[key] = join(resolveDshHome(), value.$dshHomePath);
	else resolved[key] = value;
	return resolved;
}
/** 校验并解析 manifest 的 jx.overrides 声明（非法项跳过并告警）。 */
function parseOverrides(modName, value) {
	if (value === void 0) return [];
	if (!Array.isArray(value)) {
		console.warn(`[jx-mod-manager] ${modName} 的 jx.overrides 必须是数组，已忽略`);
		return [];
	}
	const overrides = [];
	for (const item of value) {
		if (item === null || typeof item !== "object" || Array.isArray(item) || typeof item.id !== "string") {
			console.warn(`[jx-mod-manager] ${modName} 的 jx.overrides 存在非法项（需 { id, config?/disabled? }），已跳过`);
			continue;
		}
		const record = item;
		const hasConfig = record.config !== null && typeof record.config === "object" && !Array.isArray(record.config);
		const hasDisabled = record.disabled === true || record.disabled === false;
		if (!hasConfig && !hasDisabled) {
			console.warn(`[jx-mod-manager] ${modName} 的 jx.overrides 项 ${String(record.id)} 缺少 config 或 disabled，已跳过`);
			continue;
		}
		overrides.push({
			id: record.id,
			...hasConfig ? { config: record.config } : {},
			...hasDisabled ? { disabled: record.disabled } : {}
		});
	}
	return overrides;
}
/** 从模组 package.json 解析宿主入口（exports["."] 优先，其次 main，最后 index.js）。 */
function resolveEntry(manifest) {
	const dot = manifest.exports !== null && typeof manifest.exports === "object" && !Array.isArray(manifest.exports) ? manifest.exports["."] : void 0;
	const entry = [
		typeof manifest.exports === "string" ? manifest.exports : void 0,
		typeof dot === "string" ? dot : void 0,
		dot !== null && typeof dot === "object" ? [
			dot.default,
			dot.import,
			dot.node
		].find((value) => typeof value === "string") : void 0,
		typeof manifest.main === "string" ? manifest.main : void 0,
		"index.js"
	].find((value) => typeof value === "string");
	if (entry === void 0) return void 0;
	return entry.replace(/^\.\//, "").replace(/^\/+/, "");
}
/** 扫描 插件\ 生成模组行（含开关状态合并）。 */
function listMods() {
	const state = readState();
	const rows = [];
	if (!existsSync(MODS_ROOT)) return rows;
	for (const dirName of readdirSync(MODS_ROOT).sort()) {
		if (dirName.startsWith(".") || dirName === "node_modules") continue;
		const modDir = join(MODS_ROOT, dirName);
		if (!statSync(modDir).isDirectory()) continue;
		const pkgPath = join(modDir, "package.json");
		if (!existsSync(pkgPath)) continue;
		let manifest;
		try {
			manifest = JSON.parse(readFileSync(pkgPath, "utf8"));
		} catch (error) {
			rows.push({
				id: dirName,
				name: dirName,
				version: "",
				description: `package.json 解析失败：${String(error)}`,
				entry: "",
				hasClient: false,
				replaces: [],
				overrides: [],
				enabled: false
			});
			continue;
		}
		if (dirName === SELF_PACKAGE) continue;
		const jx = manifest.jx ?? {};
		const replaces = Array.isArray(jx.replaces) ? jx.replaces.filter((id) => typeof id === "string") : [];
		const overrides = parseOverrides(dirName, jx.overrides);
		const defaultEnabled = jx.defaultEnabled === false ? false : true;
		const entry = resolveEntry(manifest);
		const ownConfig = jx.config !== null && typeof jx.config === "object" && !Array.isArray(jx.config) ? jx.config : void 0;
		rows.push({
			id: dirName,
			name: typeof manifest.name === "string" ? manifest.name : dirName,
			version: typeof manifest.version === "string" ? manifest.version : "",
			description: typeof jx.description === "string" ? jx.description : typeof manifest.description === "string" ? manifest.description : "",
			entry: entry ?? "",
			hasClient: manifest.dsh?.client !== void 0,
			replaces,
			overrides,
			...ownConfig === void 0 ? {} : { config: ownConfig },
			enabled: entry !== void 0 && (dirName in state ? state[dirName] === true : defaultEnabled)
		});
	}
	return rows;
}
/**
* 生成补丁层内容（JSON 数组——合法 YAML 流式写法，避开引号转义问题）。
* 行序：所有 replaces 的 disable 行 → overrides 的 config 覆盖行 → insert 行；
* insert 的 name 是相对补丁文件的入口路径（加载器会把 ./ 路径锚定到补丁文件旁）。
*/
function renderPatch(rows) {
	const patches = [];
	const inserts = [];
	const disabledIds = /* @__PURE__ */ new Set();
	for (const row of rows) {
		if (!row.enabled || row.entry === "") continue;
		if (!existsSync(join(MODS_ROOT, row.id, row.entry))) {
			console.warn(`[jx-mod-manager] ${row.id} 的入口 ${row.entry} 不存在（未构建？），本次启动跳过挂载`);
			continue;
		}
		for (const nativeId of row.replaces) {
			if (disabledIds.has(nativeId)) continue;
			disabledIds.add(nativeId);
			patches.push({
				id: nativeId,
				disabled: true
			});
		}
		for (const override of row.overrides) patches.push({
			id: override.id,
			...override.disabled === void 0 ? {} : { disabled: override.disabled },
			...override.config === void 0 ? {} : { config: resolveConfigValues(override.config) }
		});
		inserts.push({
			id: row.id,
			name: `./${row.id}/${row.entry}`,
			...row.config === void 0 ? {} : { config: resolveConfigValues(row.config) }
		});
	}
	if (inserts.length > 0) patches.push({ insert: inserts });
	return `${JSON.stringify(patches, null, 2)}\n`;
}
/** 按当前状态重写补丁层文件。 */
function regeneratePatch(rows) {
	mkdirSync(MODS_ROOT, { recursive: true });
	writeFileSync(PATCH_FILE, renderPatch(rows), "utf8");
}
/** 翻转一个模组的开关并重新生成补丁层。找不到模组时抛错。 */
function setModEnabled(id, enabled) {
	const rows = listMods();
	const row = rows.find((candidate) => candidate.id === id);
	if (row === void 0) throw new Error(`jx-mod-manager: unknown mod ${JSON.stringify(id)}`);
	const state = readState();
	state[id] = enabled;
	writeState(state);
	row.enabled = enabled;
	regeneratePatch(rows);
}
//#endregion
export { MODS_ROOT, PATCH_FILE, STATE_FILE, listMods, regeneratePatch, setModEnabled };
