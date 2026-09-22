window.__ModuleLoader__.load({ id: "dsh-permission-split", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
Object.defineProperties(exports, {
	__esModule: { value: true },
	[Symbol.toStringTag]: { value: "Module" }
});
//#region src/client.ts
/** 客户端半边插件名。 */
const name = "dsh-permission-split-client";
/**
* 客户端半边装载入口。
* @param _ctx - 浏览器侧 Host 上下文。
*/
function apply(_ctx) {}
var client_default = {
	name,
	apply
};
//#endregion
exports.apply = apply;
exports.default = client_default;
exports.name = name;

return module.exports; } });