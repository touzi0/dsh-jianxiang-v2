import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
//#region src/index.ts
const name = "dsh-mode-switch";
var JxPresetGateway = class extends TypertRemoteService {
	/** 类形式插件的注入声明（写法对照官方 PluginInventoryGateway）。 */
	static inject = [
		"agents",
		"agentPresets",
		"sessionProjections"
	];
	/** 每会话串行化（与官方 select 的队列语义一致）。 */
	switches = /* @__PURE__ */ new Map();
	constructor(ctx) {
		super(ctx, "jxPreset");
	}
	/**
	* 强制把一个会话切到指定预设。开谈后仍可切（官方锁定的场景），但回合
	* 进行中拒绝。成功后与官方路径一致地记录 agent-preset/selected 事件。
	* @returns 生效的预设 id。
	*/
	async switch(sessionId, agentPreset) {
		const agents = this.ctx.agents;
		const presets = this.ctx.agentPresets;
		const projections = this.ctx.sessionProjections;
		const agent = agents.get(sessionId);
		if (agent === void 0) throw new Error(`dsh-mode-switch: no live agent for session ${JSON.stringify(sessionId)}`);
		const turn = (this.switches.get(sessionId) ?? Promise.resolve()).then(async () => {
			const boundary = projections.stateOf(agent.session, "turnBoundary");
			if (boundary !== void 0 && boundary.openTurnStartSeq !== null) throw new Error("dsh-mode-switch: 会话回合正在进行中，等它结束后再切换模式");
			const preset = await presets.recompose(agent.ctx, agentPreset);
			agent.session.append("agent-preset/selected", { agentPreset: preset.id });
			return preset.id;
		});
		const guard = turn.catch(() => void 0);
		this.switches.set(sessionId, guard);
		try {
			return await turn;
		} finally {
			if (this.switches.get(sessionId) === guard) this.switches.delete(sessionId);
		}
	}
};
Object.defineProperty(JxPresetGateway.prototype, "@deepseek-ai/dsh-typert-protocol/remote-methods", {
	configurable: true,
	value: Object.freeze({
		version: 1,
		methods: Object.freeze([{
			method: "switch",
			invocation: Object.freeze({ kind: "direct" })
		}])
	})
});
//#endregion
export { JxPresetGateway, JxPresetGateway as default, name };
