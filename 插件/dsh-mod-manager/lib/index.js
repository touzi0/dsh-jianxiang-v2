import { MODS_ROOT, PATCH_FILE, listMods, regeneratePatch, setModEnabled } from "./mods.js";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
//#region src/index.ts
var JxModsGateway = class extends TypertRemoteService {
	constructor(ctx) {
		super(ctx, "jxMods");
		regeneratePatch(listMods());
	}
	/** 当前模组清单（含开关状态）。 */
	async list() {
		return {
			modsRoot: MODS_ROOT,
			patchFile: PATCH_FILE,
			mods: listMods()
		};
	}
	/** 翻转一个模组的开关，重新生成补丁层；重启后生效。 */
	async setEnabled(id, enabled) {
		setModEnabled(id, enabled);
		return { restartNeeded: true };
	}
	/** 重新扫描 插件\ 目录并按状态重写补丁层（新增模组文件夹后调用）。 */
	async rescan() {
		const mods = listMods();
		regeneratePatch(mods);
		return {
			modsRoot: MODS_ROOT,
			patchFile: PATCH_FILE,
			mods
		};
	}
};
const REMOTE_METHODS_KEY = "@deepseek-ai/dsh-typert-protocol/remote-methods";
const directMarker = (method) => Object.freeze({
	method,
	invocation: Object.freeze({ kind: "direct" })
});
Object.defineProperty(JxModsGateway.prototype, REMOTE_METHODS_KEY, {
	configurable: true,
	value: Object.freeze({
		version: 1,
		methods: Object.freeze([
			directMarker("list"),
			directMarker("setEnabled"),
			directMarker("rescan")
		])
	})
});
//#endregion
export { JxModsGateway, JxModsGateway as default, MODS_ROOT, PATCH_FILE };
