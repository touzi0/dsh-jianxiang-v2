import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { BlockAssembler, createUserMessage } from "@deepseek-ai/dsh-llm";
//#region src/git.ts
/**
* Git 面板的纯逻辑层（宿主半边）：porcelain 输出解析、diff 行分类、文本截断与仓库定位。
* 这里不执行任何命令、不碰全局状态，便于 selftest.mjs 逐条断言；
* 命令执行与 Remote 注册在 src/index.ts。
*/
/**
* 解析 `git status --porcelain=v2 --branch -z`。
* `-z` 下记录以 NUL 分隔且路径不做引号转义，因此空格、中文、换行路径都原样保留；
* 类型 `2`（重命名/复制）的原路径是紧随其后的独立字段。
* @param raw - 子进程 stdout 原文（含 NUL）。
* @returns 分支头信息与逐文件状态。
*/
function parseStatusV2(raw) {
	let branch = "";
	let oid = "";
	let upstream = "";
	let ahead = 0;
	let behind = 0;
	const entries = [];
	const fields = raw.split("\0");
	for (let index = 0; index < fields.length; index++) {
		const field = fields[index];
		if (field === "") continue;
		if (field.startsWith("# ")) {
			if (field.startsWith("# branch.oid ")) oid = field.slice(13);
			else if (field.startsWith("# branch.head ")) branch = field.slice(14);
			else if (field.startsWith("# branch.upstream ")) upstream = field.slice(18);
			else if (field.startsWith("# branch.ab ")) {
				const match = /^# branch\.ab \+(\d+) -(\d+)$/.exec(field);
				if (match !== null) {
					ahead = Number(match[1]);
					behind = Number(match[2]);
				}
			}
			continue;
		}
		const kind = field[0];
		if (kind === "?") {
			entries.push({
				index: ".",
				worktree: ".",
				mark: "??",
				path: field.slice(2),
				original: ""
			});
			continue;
		}
		if (kind === "!") continue;
		if (kind === "u") {
			const parts = field.split(" ");
			entries.push({
				index: (parts[1] ?? "U").slice(0, 1),
				worktree: (parts[1] ?? "U").slice(1, 2),
				mark: "",
				path: parts.slice(10).join(" "),
				original: ""
			});
			continue;
		}
		if (kind === "1" || kind === "2") {
			const parts = field.split(" ");
			const xy = parts[1] ?? "..";
			const pathStart = kind === "1" ? 8 : 9;
			const original = kind === "2" ? fields[index + 1] ?? "" : "";
			if (kind === "2") index++;
			entries.push({
				index: xy.slice(0, 1),
				worktree: xy.slice(1, 2),
				mark: "",
				path: parts.slice(pathStart).join(" "),
				original
			});
		}
	}
	return {
		branch,
		oid,
		upstream,
		ahead,
		behind,
		entries
	};
}
/**
* 把改动文件分到「已暂存 / 未暂存 / 未跟踪 / 冲突」四组。
* 一个文件可同时出现在前两组（`MM`：已暂存改动之上又有未暂存改动），与 git 语义一致。
* @param entries - parseStatusV2 的条目。
* @returns 四组列表（各自保持 git 输出顺序）。
*/
function groupStatus(entries) {
	const staged = [];
	const unstaged = [];
	const untracked = [];
	const conflicted = [];
	for (const entry of entries) {
		if (entry.mark === "??") {
			untracked.push(entry);
			continue;
		}
		if (entry.index === "U" || entry.worktree === "U") {
			conflicted.push(entry);
			continue;
		}
		if (entry.index !== "." && entry.index !== " ") staged.push(entry);
		if (entry.worktree !== "." && entry.worktree !== " ") unstaged.push(entry);
	}
	return {
		staged,
		unstaged,
		untracked,
		conflicted
	};
}
/**
* 按 UTF-8 字节上限截断文本，保留行边界。
* @param text - 原文。
* @param maxBytes - 上限（字节）。
* @returns 截断后的文本与是否发生截断。
*/
function capText(text, maxBytes) {
	if (Buffer.byteLength(text, "utf8") <= maxBytes) return {
		text,
		truncated: false
	};
	const sliced = Buffer.from(text, "utf8").subarray(0, maxBytes).toString("utf8");
	const lastBreak = sliced.lastIndexOf("\n");
	return {
		text: lastBreak > 0 ? sliced.slice(0, lastBreak + 1) : sliced,
		truncated: true
	};
}
/**
* 解析 `git log --pretty=format:%H<US>%an<US>%ad<US>%s<RS>` 的输出。
* @param raw - 子进程 stdout 原文。
* @returns 提交列表（顺序即 git 输出顺序）。
*/
function parseLog(raw) {
	return raw.split("").map((record) => record.replace(/^\n+/u, "")).filter((record) => record !== "").map((record) => {
		const [hash = "", author = "", time = "", subject = ""] = record.split("");
		return {
			hash,
			author,
			time,
			subject
		};
	}).filter((commit) => commit.hash !== "");
}
/**
* 解析 `git show --name-status -z --format=` 的文件清单。
* 记录形如 `M\0path\0`，重命名为 `R100\0old\0new\0`。
* @param raw - 子进程 stdout 原文。
* @returns 每个改动的状态字母与原路径（重命名时 original 为旧路径）。
*/
function parseNameStatus(raw) {
	const fields = raw.split("\0").filter((field) => field !== "");
	const files = [];
	for (let index = 0; index < fields.length; index++) {
		const status = fields[index];
		if (!/^[A-Z]\d*$/u.test(status)) continue;
		const letter = status.slice(0, 1);
		if (letter === "R" || letter === "C") {
			const original = fields[index + 1] ?? "";
			const path = fields[index + 2] ?? "";
			index += 2;
			files.push({
				status: letter,
				path,
				original
			});
			continue;
		}
		files.push({
			status: letter,
			path: fields[index + 1] ?? "",
			original: ""
		});
		index++;
	}
	return files;
}
/** 扫描仓库时的跳过目录（依赖与元数据目录里不会有独立仓库）。 */
const SKIPPED_DIRECTORIES = new Set([
	"node_modules",
	".git",
	".cache",
	"dist",
	"lib",
	"target",
	"vendor"
]);
/** 单次扫描最多检查的目录数，防止在大树上卡住。 */
const SCAN_BUDGET = 400;
/**
* diff 文本是否表示二进制差异（git 对二进制文件的两种写法）。
* @param text - diff 原文。
* @returns 是二进制差异则为 true。
*/
function diffIsBinary(text) {
	return /^GIT binary patch$/mu.test(text) || /^Binary files .* differ$/mu.test(text);
}
/**
* 把整份文件内容合成「新增」diff：未跟踪文件没有 index 版本可比，
* git diff 为空，面板用这份合成文本展示内容（每行加 `+`）。
* @param text - 文件内容。
* @param displayPath - 展示用路径（仓库内相对路径）。
* @param maxLines - 最多合成的行数。
* @returns 合成文本与是否截断。
*/
function addedTextDiff(text, displayPath, maxLines) {
	const lines = text.split("\n");
	if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
	const truncated = lines.length > maxLines;
	const kept = truncated ? lines.slice(0, maxLines) : lines;
	return {
		text: `${`--- /dev/null\n+++ b/${displayPath}\n`}${kept.map((line) => `+${line}`).join("\n")}\n`,
		truncated
	};
}
/**
* 判断目录是否是 git 仓库根（含 worktree/submodule 的 `.git` 文件形式）。
* @param dir - 待判断目录。
* @returns 是仓库根则为 true。
*/
function isRepositoryRoot(dir) {
	return existsSync(join(dir, ".git"));
}
/**
* 以 base 为起点向下找仓库根（深度受限、跳过依赖目录、预算封顶）。
* 会话工作目录常常只是某个仓库的一级子目录，因此扫描范围包含 base 自身与它下面两层。
* @param base - 扫描起点目录。
* @param maxDepth - 向下层数（base 自身算 0 层）。
* @returns 找到的仓库根绝对路径，按发现顺序。
*/
function findRepositories(base, maxDepth) {
	const found = [];
	let budget = SCAN_BUDGET;
	const walk = (dir, depth) => {
		if (budget <= 0 || found.length >= 12) return;
		if (isRepositoryRoot(dir)) {
			found.push(resolve(dir));
			return;
		}
		if (depth >= maxDepth) return;
		let names;
		try {
			names = readdirSync(dir);
		} catch {
			return;
		}
		for (const name of names) {
			if (budget <= 0) return;
			if (name.startsWith(".") || SKIPPED_DIRECTORIES.has(name)) continue;
			const child = join(dir, name);
			budget--;
			try {
				if (!statSync(child).isDirectory()) continue;
			} catch {
				continue;
			}
			walk(child, depth + 1);
		}
	};
	walk(base, 0);
	return found;
}
/**
* 仓库根的展示名：取目录名。
* @param path - 仓库根绝对路径。
* @returns 展示名。
*/
function repositoryName(path) {
	return basename(path) === "" ? path : basename(path);
}
/** 提交信息字符数上限（单个 -m 参数的安全边界）。 */
const MESSAGE_MAX_CHARS = 4e3;
/**
* 净化提交信息：去掉控制字符（换行保留——多行提交信息合法）、压缩多余空行、限长。
* @param message - 用户输入或 AI 生成的提交信息原文。
* @returns 可安全作为单个 -m 参数的文本；空串表示没有可用内容。
*/
function sanitizeMessage(message) {
	return message.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "").replace(/\r\n?/gu, "\n").replace(/\n{3,}/gu, "\n\n").trim().slice(0, MESSAGE_MAX_CHARS);
}
/**
* 过滤出一组可安全传给 git 的 pathspec（在 `--` 之后作为独立 argv 元素使用）：
* 拒绝绝对路径、`..`/`.` 段、pathspec magic 前缀、目录形式、含 NUL 的项，并去重限数。
* @param paths - 浏览器送来的路径列表。
* @returns 通过校验的路径（保持原顺序）。
*/
function safePathspecs(paths) {
	const seen = /* @__PURE__ */ new Set();
	const ok = [];
	for (const path of paths) {
		if (ok.length >= 500) break;
		if (path === "" || path.includes("\0") || path.length > 4096) continue;
		if (/^[a-zA-Z]:[\\/]/u.test(path) || path.startsWith("/") || path.startsWith("\\")) continue;
		if (path.startsWith(":") || path.startsWith("!") || path.startsWith("^")) continue;
		const segments = path.split(/[\\/]/u);
		if (segments.includes("..") || segments.includes(".")) continue;
		if (path.endsWith("/")) continue;
		if (seen.has(path)) continue;
		seen.add(path);
		ok.push(path);
	}
	return ok;
}
//#endregion
//#region src/index.ts
/**
* 坚祥 Git 面板 —— 宿主半边。
*
* 执行缝用官方 `ctx.subprocess`（显式 argv、永不过 shell、输出上限、AbortSignal 超时），
* 不使用 `ctx.shell`（它只吃命令字符串并强制套沙箱）。白名单子命令：
* 读数 `rev-parse` / `status` / `diff` / `log` / `show`；
* 本地写 `add` / `restore --staged` / `commit`（暂存、取消暂存、提交——全部只动 index 与本地历史，
* 不做 push/pull/reset/checkout/discard 任何远端或工作区内容操作）；
* `repo` 参数只能取本服务自己扫描出的候选仓库根，浏览器给不出任意路径。
*
* 工作目录由 sessionId 解析（活会话 header.cwd），仓库识别照官方
* `workspace-changes` 的 `rev-parse --show-toplevel` 配方（该包不导出可复用 API）。
* AI 提交摘要走官方 `ctx.llm`（与 dsh-ssh-review 的快评同一用法）。
*/
/** 单条 git 命令的超时（只读命令；仓库很大时 status 也可能慢）。 */
const GIT_TIMEOUT_MS = 15e3;
/** stdout 保留上限：超过即标记 truncated（diff 在服务端另有更小的展示上限）。 */
const GIT_STDOUT_MAX_BYTES = 4 * 1024 * 1024;
/** stderr 尾巴（只要错误原因）。 */
const GIT_STDERR_MAX_BYTES = 16 * 1024;
/** 终止宽限：先礼后兵，给 git 收尾的时间。 */
const TERMINATE_GRACE_MS = 2e3;
/** 单次 diff / 伪 diff 返回给浏览器的文本上限。 */
const DIFF_MAX_BYTES = 200 * 1024;
/** 未跟踪文件的伪 diff 行数上限。 */
const ADDED_DIFF_MAX_LINES = 4e3;
/** 状态列表条目上限（防御极端仓库把界面拖死）。 */
const STATUS_MAX_ENTRIES = 1e3;
/** 提交历史默认/上限条数。 */
const LOG_DEFAULT = 30;
const LOG_MAX = 100;
/** 候选仓库扫描结果的缓存时长。 */
const SCAN_TTL_MS = 1e4;
/** AI 摘要用的供应商与模型（与 dsh-ssh-review 的快评同款默认）。 */
const SUMMARY_PROVIDER = "deepseek-official";
const SUMMARY_MODEL = "deepseek-chat";
/** AI 摘要的 LLM 超时。 */
const SUMMARY_TIMEOUT_MS = 45e3;
/** 喂给 LLM 的 staged diff 文本上限。 */
const SUMMARY_DIFF_MAX_CHARS = 24e3;
var JxGitGateway = class extends TypertRemoteService {
	static inject = [
		"subprocess",
		"sessions",
		"llm"
	];
	scans = /* @__PURE__ */ new Map();
	constructor(ctx) {
		super(ctx, "jxGit");
	}
	/** 官方子进程缝。 */
	get subprocess() {
		return this.ctx.subprocess;
	}
	/**
	* sessionId → 会话工作目录。
	* @param sessionId - 目标会话。
	* @returns 绝对路径。
	*/
	sessionCwd(sessionId) {
		const cwd = this.ctx.sessions.get(sessionId)?.header.cwd;
		if (cwd === void 0 || cwd === "") throw new Error(`会话 ${sessionId} 没有工作目录，无法显示 git 信息（该会话可能已被关闭或清理）。`);
		return cwd;
	}
	/**
	* 跑一条只读 git 命令。
	* @param cwd - 工作目录（必须是仓库内路径）。
	* @param args - 白名单子命令参数（argv 数组，永不过 shell）。
	* @param signal - 浏览器侧取消信号。
	* @returns 退出码、stdout/stderr 文本与截断标记。
	*/
	async runGit(cwd, args, signal) {
		const subprocess = this.subprocess;
		const executable = await subprocess.resolveExecutable("git", void 0, signal);
		const timeout = AbortSignal.timeout(GIT_TIMEOUT_MS);
		const fused = signal === void 0 ? timeout : AbortSignal.any([signal, timeout]);
		const handle = subprocess.spawn({
			argv: [executable, ...args],
			cwd,
			stdio: {
				stdin: "ignore",
				stdout: { maxBytes: GIT_STDOUT_MAX_BYTES },
				stderr: { maxBytes: GIT_STDERR_MAX_BYTES }
			},
			graceMs: TERMINATE_GRACE_MS,
			signal: fused,
			env: {
				GIT_CONFIG_COUNT: "0",
				GIT_TERMINAL_PROMPT: "0",
				GIT_OPTIONAL_LOCKS: "0",
				LC_ALL: "C"
			}
		});
		const outcome = await handle.done;
		if (fused.aborted) throw new Error(timeout.aborted ? `git ${args.join(" ")} 超过 ${GIT_TIMEOUT_MS}ms 未结束，已终止。` : "git 调用已取消。");
		const stdout = handle.collected.stdout?.readFrom(0);
		const stderr = handle.collected.stderr?.readFrom(0);
		return {
			exitCode: outcome.exitCode,
			stdout: stdout?.text ?? "",
			stderr: stderr?.text ?? "",
			truncated: stdout?.lossy ?? false
		};
	}
	/**
	* 目录所属仓库根。
	* @param cwd - 起始目录。
	* @param signal - 取消信号。
	* @returns 仓库根绝对路径；不在仓库内为 undefined。
	*/
	async repositoryRoot(cwd, signal) {
		const found = await this.runGit(cwd, ["rev-parse", "--show-toplevel"], signal);
		if (found.exitCode === 128 && /not a git repository/i.test(found.stderr)) return void 0;
		if (found.exitCode !== 0) throw new Error(`git rev-parse 失败（退出码 ${String(found.exitCode)}）：${found.stderr.trim()}`);
		const root = found.stdout.trim();
		return root === "" ? void 0 : root;
	}
	/**
	* 候选仓库：cwd 所属仓库优先，其次扫描它周围（上一级目录向下两层）发现并列仓库。
	* @param sessionId - 缓存键。
	* @param cwd - 会话工作目录。
	* @param signal - 取消信号。
	* @returns 候选仓库列表（可能为空）。
	*/
	async candidates(sessionId, cwd, signal) {
		const cached = this.scans.get(sessionId);
		if (cached !== void 0 && cached.cwd === cwd && Date.now() - cached.at < SCAN_TTL_MS) return cached.repos;
		const own = await this.repositoryRoot(cwd, signal);
		const base = own === void 0 ? cwd : dirname(own);
		const paths = [own ?? "", ...findRepositories(base, 2)].filter((path) => path !== "");
		const seen = /* @__PURE__ */ new Set();
		const repos = [];
		for (const path of paths) {
			const key = path.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			repos.push({
				path,
				name: repositoryName(path)
			});
		}
		this.scans.set(sessionId, {
			cwd,
			at: Date.now(),
			repos
		});
		return repos;
	}
	/**
	* 校验并解析浏览器传来的仓库参数。
	* @param sessionId - 目标会话。
	* @param repo - 浏览器选中的仓库根（空串表示默认）。
	* @param signal - 取消信号。
	* @returns 会话工作目录、选中仓库根与候选列表；没有仓库时 root 为空串。
	*/
	async resolveRepo(sessionId, repo, signal) {
		const cwd = this.sessionCwd(sessionId);
		const repos = await this.candidates(sessionId, cwd, signal);
		return {
			cwd,
			root: repos.find((candidate) => candidate.path === repo)?.path ?? repos[0]?.path ?? "",
			repos
		};
	}
	/**
	* 当前会话仓库的状态：分支、领先/落后、分组改动与候选仓库列表。
	* @param sessionId - 目标会话 id。
	* @param repo - 选中的仓库根（空串=默认仓库）。
	* @param signal - 浏览器侧取消信号（网关按位置识别，必须是最后一个参数）。
	* @returns 状态结果。
	*/
	async status(sessionId, repo, signal) {
		const { cwd, root, repos } = await this.resolveRepo(sessionId, repo, signal);
		if (root === "") return {
			repos,
			repo: "",
			branch: "",
			oid: "",
			upstream: "",
			ahead: 0,
			behind: 0,
			staged: [],
			unstaged: [],
			untracked: [],
			conflicted: [],
			truncated: false,
			reason: `当前会话目录不是 git 仓库：${cwd}`
		};
		const found = await this.runGit(root, [
			"status",
			"--porcelain=v2",
			"--branch",
			"-z"
		], signal);
		if (found.exitCode !== 0) throw new Error(`git status 失败（退出码 ${String(found.exitCode)}）：${found.stderr.trim()}`);
		const parsed = parseStatusV2(found.stdout);
		const groups = groupStatus(parsed.entries);
		const overLimit = parsed.entries.length > STATUS_MAX_ENTRIES;
		const limit = (list) => list.slice(0, STATUS_MAX_ENTRIES);
		return {
			repos,
			repo: root,
			branch: parsed.branch === "(detached)" ? "" : parsed.branch,
			oid: parsed.oid,
			upstream: parsed.upstream,
			ahead: parsed.ahead,
			behind: parsed.behind,
			staged: limit(groups.staged),
			unstaged: limit(groups.unstaged),
			untracked: limit(groups.untracked),
			conflicted: limit(groups.conflicted),
			truncated: found.truncated || overLimit,
			reason: ""
		};
	}
	/**
	* 单个文件的 diff（未暂存 / 已暂存）；未跟踪文件在无 diff 时用文件内容合成「整份新增」。
	* @param sessionId - 目标会话 id。
	* @param repo - 选中的仓库根（空串=默认仓库）。
	* @param path - 仓库内相对路径。
	* @param staged - true 读索引对 HEAD 的差异，false 读工作区对索引的差异。
	* @param signal - 浏览器侧取消信号（必须最后）。
	* @returns diff 文本与标记。
	*/
	async diff(sessionId, repo, path, staged, signal) {
		const { root } = await this.resolveRepo(sessionId, repo, signal);
		if (root === "") return {
			text: "",
			truncated: false,
			binary: false,
			empty: true
		};
		const args = [
			"diff",
			"--no-color",
			"--no-ext-diff",
			"--find-renames",
			"--unified=3"
		];
		if (staged) args.push("--cached");
		args.push("--", path);
		const found = await this.runGit(root, args, signal);
		if (found.exitCode !== 0) throw new Error(`git diff 失败（退出码 ${String(found.exitCode)}）：${found.stderr.trim()}`);
		let text = found.stdout;
		let truncated = found.truncated;
		if (text === "" && !staged) {
			const added = this.addedFileDiff(join(root, path), path);
			if (added !== void 0) {
				text = added.text;
				truncated = added.truncated;
			}
		}
		const capped = capText(text, DIFF_MAX_BYTES);
		return {
			text: capped.text,
			truncated: truncated || capped.truncated,
			binary: diffIsBinary(text),
			empty: text === ""
		};
	}
	/**
	* 最近提交历史（只读）。
	* @param sessionId - 目标会话 id。
	* @param repo - 选中的仓库根（空串=默认仓库）。
	* @param limit - 条数（1..100，越界自动收敛）。
	* @param signal - 浏览器侧取消信号（必须最后）。
	* @returns 一页提交与是否还有更早的提交。
	*/
	async log(sessionId, repo, limit, signal) {
		const { root } = await this.resolveRepo(sessionId, repo, signal);
		if (root === "") return {
			commits: [],
			more: false,
			empty: true
		};
		const wanted = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), LOG_MAX) : LOG_DEFAULT;
		const found = await this.runGit(root, [
			"log",
			`-n${wanted + 1}`,
			"--date=iso-strict",
			`--pretty=format:%H%an%ad%s`
		], signal);
		if (found.exitCode !== 0) {
			if (/does not have any commits yet|unknown revision|bad default revision/i.test(found.stderr)) return {
				commits: [],
				more: false,
				empty: true
			};
			throw new Error(`git log 失败（退出码 ${String(found.exitCode)}）：${found.stderr.trim()}`);
		}
		const parsed = parseLog(found.stdout);
		return {
			commits: parsed.slice(0, wanted).map((commit) => ({
				...commit,
				short: commit.hash.slice(0, 8)
			})),
			more: parsed.length > wanted,
			empty: parsed.length === 0
		};
	}
	/**
	* 单次提交的文件清单与 diff（只读）。
	* @param sessionId - 目标会话 id。
	* @param repo - 选中的仓库根（空串=默认仓库）。
	* @param hash - 提交哈希（4..40 位十六进制；非法直接拒绝）。
	* @param signal - 浏览器侧取消信号（必须最后）。
	* @returns 文件清单与 diff。
	*/
	async show(sessionId, repo, hash, signal) {
		const { root } = await this.resolveRepo(sessionId, repo, signal);
		if (root === "") return {
			files: [],
			diff: {
				text: "",
				truncated: false,
				binary: false,
				empty: true
			}
		};
		if (!/^[0-9a-fA-F]{4,40}$/u.test(hash)) throw new Error(`提交标识不合法：${hash}`);
		const names = await this.runGit(root, [
			"show",
			"--name-status",
			"-z",
			"--format=",
			hash
		], signal);
		if (names.exitCode !== 0) throw new Error(`git show --name-status 失败（退出码 ${String(names.exitCode)}）：${names.stderr.trim()}`);
		const patch = await this.runGit(root, [
			"show",
			"--patch",
			"--no-color",
			"--no-ext-diff",
			"--unified=3",
			"--format=",
			hash
		], signal);
		if (patch.exitCode !== 0) throw new Error(`git show 失败（退出码 ${String(patch.exitCode)}）：${patch.stderr.trim()}`);
		const capped = capText(patch.stdout, DIFF_MAX_BYTES);
		return {
			files: parseNameStatus(names.stdout).map((file) => ({
				index: file.status,
				worktree: ".",
				mark: "",
				path: file.path,
				original: file.original
			})),
			diff: {
				text: capped.text,
				truncated: patch.truncated || capped.truncated,
				binary: diffIsBinary(patch.stdout),
				empty: patch.stdout === ""
			}
		};
	}
	/**
	* 未跟踪文件的伪 diff：把文件内容合成为整份新增。
	* @param absolutePath - 文件绝对路径（已由仓库根与相对路径拼出）。
	* @param displayPath - 展示用相对路径。
	* @returns 合成的 diff 与截断标记；文件读不到时为 undefined。
	*/
	addedFileDiff(absolutePath, displayPath) {
		try {
			if (!statSync(absolutePath).isFile()) return void 0;
			if (statSync(absolutePath).size > DIFF_MAX_BYTES * 8) return {
				text: `（文件超过 ${String(Math.round(DIFF_MAX_BYTES * 8 / 1024))}KB，未跟踪文件不展示内容）\n`,
				truncated: true
			};
			const raw = readFileSync(absolutePath);
			if (raw.includes(0)) return {
				text: "",
				truncated: false
			};
			return addedTextDiff(raw.toString("utf8"), displayPath, ADDED_DIFF_MAX_LINES);
		} catch {
			return;
		}
	}
	/**
	* 暂存一批文件（git add；未跟踪文件同样适用）。
	* 只动 index，不改工作区内容，可随时用 unstage 撤销。
	* @param sessionId - 目标会话 id。
	* @param repo - 选中的仓库根（空串=默认仓库）。
	* @param paths - 仓库内相对路径列表（逐项校验，见 safePathspecs）。
	* @param signal - 浏览器侧取消信号（必须最后）。
	* @returns 实际生效的路径条数。
	*/
	async stage(sessionId, repo, paths, signal) {
		const spec = safePathspecs(paths);
		if (spec.length === 0) throw new Error("没有可暂存的路径（列表为空或全部未通过校验）。");
		const { root } = await this.resolveRepo(sessionId, repo, signal);
		if (root === "") throw new Error("当前会话目录不是 git 仓库，无法暂存。");
		const found = await this.runGit(root, [
			"add",
			"--",
			...spec
		], signal);
		if (found.exitCode !== 0) throw new Error(`git add 失败（退出码 ${String(found.exitCode)}）：${found.stderr.trim()}`);
		return { count: spec.length };
	}
	/**
	* 取消暂存一批文件（git restore --staged；把 index 恢复成 HEAD 的样子）。
	* 同样只动 index，工作区内容不受影响。
	* @param sessionId - 目标会话 id。
	* @param repo - 选中的仓库根（空串=默认仓库）。
	* @param paths - 仓库内相对路径列表。
	* @param signal - 浏览器侧取消信号（必须最后）。
	* @returns 实际生效的路径条数。
	*/
	async unstage(sessionId, repo, paths, signal) {
		const spec = safePathspecs(paths);
		if (spec.length === 0) throw new Error("没有可取消暂存的路径（列表为空或全部未通过校验）。");
		const { root } = await this.resolveRepo(sessionId, repo, signal);
		if (root === "") throw new Error("当前会话目录不是 git 仓库，无法取消暂存。");
		const found = await this.runGit(root, [
			"restore",
			"--staged",
			"--",
			...spec
		], signal);
		if (found.exitCode !== 0) {
			if ((await this.runGit(root, [
				"rm",
				"--cached",
				"--",
				...spec
			], signal)).exitCode !== 0) throw new Error(`git restore --staged 失败（退出码 ${String(found.exitCode)}）：${found.stderr.trim()}`);
		}
		return { count: spec.length };
	}
	/**
	* 用给定信息提交已暂存的改动（git commit -m）。
	* 只提交 index 里已有的内容；没有已暂存改动时 git 自己报错并原样转述。
	* @param sessionId - 目标会话 id。
	* @param repo - 选中的仓库根（空串=默认仓库）。
	* @param message - 提交信息（净化后作为单个 -m 参数）。
	* @param signal - 浏览器侧取消信号（必须最后）。
	* @returns git 输出的提交摘要行。
	*/
	async commit(sessionId, repo, message, signal) {
		const text = sanitizeMessage(message);
		if (text === "") throw new Error("提交信息为空：请先输入内容，或用「AI 生成摘要并提交」。");
		const { root } = await this.resolveRepo(sessionId, repo, signal);
		if (root === "") throw new Error("当前会话目录不是 git 仓库，无法提交。");
		const found = await this.runGit(root, [
			"commit",
			"-m",
			text
		], signal);
		if (found.exitCode !== 0) throw new Error(`git commit 失败（退出码 ${String(found.exitCode)}）：${found.stderr.trim()}`);
		return { summary: found.stdout.split("\n").find((line) => line.trim() !== "") ?? "" };
	}
	/**
	* 用 LLM 为已暂存的改动生成一条提交信息（不提交，只生成）。
	* 汇总 stat 概览 + 截断后的 diff 正文喂给模型，要求输出简洁的
	* conventional commit 主题行（可带正文）。
	* @param sessionId - 目标会话 id。
	* @param repo - 选中的仓库根（空串=默认仓库）。
	* @param signal - 浏览器侧取消信号（必须最后）。
	* @returns 生成的提交信息。
	*/
	async summarize(sessionId, repo, signal) {
		const { root } = await this.resolveRepo(sessionId, repo, signal);
		if (root === "") throw new Error("当前会话目录不是 git 仓库，无法生成摘要。");
		const stat = await this.runGit(root, [
			"diff",
			"--cached",
			"--no-color",
			"--stat"
		], signal);
		if (stat.exitCode !== 0) throw new Error(`git diff --cached --stat 失败（退出码 ${String(stat.exitCode)}）：${stat.stderr.trim()}`);
		if (stat.stdout.trim() === "") throw new Error("没有已暂存的改动：请先暂存再生成摘要。");
		const patch = await this.runGit(root, [
			"diff",
			"--cached",
			"--no-color",
			"--no-ext-diff",
			"--unified=1"
		], signal);
		const diffText = `${stat.stdout}\n${patch.stdout}`.slice(0, SUMMARY_DIFF_MAX_CHARS);
		const cleaned = sanitizeMessage(await this.summarizeWithLlm(diffText, signal));
		if (cleaned === "") throw new Error("AI 生成的摘要为空，请重试或手动输入提交信息。");
		return { message: cleaned };
	}
	/**
	* 调官方 LLM 生成提交信息（流式收块；超时或失败向上抛）。
	* @param diffText - 已暂存改动的 diff 文本（已截断）。
	* @param signal - 取消信号。
	* @returns 模型输出的提交信息原文。
	*/
	async summarizeWithLlm(diffText, signal) {
		const llm = this.ctx.llm;
		if (llm === void 0) throw new Error("宿主没有可用的 LLM 服务，无法生成摘要。");
		const system = [
			"你是提交信息撰写员。根据给定的 git 已暂存改动（stat 概览 + diff），写一条提交信息。",
			"要求：第一行是简洁的主题（不超过 50 个字，中文，必要时可用 conventional commit 前缀如 fix:/feat:/docs:），",
			"如果改动较复杂可以再空一行写 2-4 行正文说明要点。",
			"只输出提交信息本身：不要代码块、不要引号、不要解释、不要 signature。"
		].join("\n");
		const user = createUserMessage({
			content: [{
				type: "text",
				text: diffText
			}],
			source: {
				kind: "plugin",
				plugin: "dsh-git-panel"
			}
		});
		const timeout = AbortSignal.timeout(SUMMARY_TIMEOUT_MS);
		const fused = signal === void 0 ? timeout : AbortSignal.any([signal, timeout]);
		const assembler = new BlockAssembler();
		for await (const chunk of llm.stream({
			provider: SUMMARY_PROVIDER,
			model: SUMMARY_MODEL,
			messages: [user],
			system,
			temperature: 0,
			maxTokens: 300,
			signal: fused
		})) assembler.push(chunk);
		return assembler.blocks().filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
	}
};
const REMOTE_METHODS_KEY = "@deepseek-ai/dsh-typert-protocol/remote-methods";
/** 一个直调方法的标记。 */
const direct = (method) => Object.freeze({
	method,
	invocation: Object.freeze({ kind: "direct" })
});
Object.defineProperty(JxGitGateway.prototype, REMOTE_METHODS_KEY, {
	configurable: true,
	value: Object.freeze({
		version: 1,
		methods: Object.freeze([
			direct("status"),
			direct("diff"),
			direct("log"),
			direct("show"),
			direct("stage"),
			direct("unstage"),
			direct("commit"),
			direct("summarize")
		])
	})
});
//#endregion
export { JxGitGateway, JxGitGateway as default };
