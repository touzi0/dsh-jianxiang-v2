import z from "@deepseek-ai/schemastery";
import { spawnSync } from "node:child_process";
//#region src/timestamp.ts
function createTimestampFormatter(timeZone, includeSeconds = false) {
	return new Intl.DateTimeFormat("en-US", {
		...timeZone === void 0 ? {} : { timeZone },
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		...includeSeconds ? { second: "2-digit" } : {},
		hourCycle: "h23",
		timeZoneName: "longOffset"
	});
}
function formatTimestamp(now, formatter, timeZone, includeSeconds = false) {
	const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
	const offset = parts.timeZoneName.replace(/^GMT$/, "GMT+00:00").slice(3);
	const seconds = includeSeconds ? `:${parts["second"]}` : "";
	return `${parts["year"]}-${parts["month"]}-${parts["day"]}T${parts["hour"]}:${parts["minute"]}${seconds}${offset}[${timeZone}]`;
}
//#endregion
//#region src/index.ts
const name = "dsh-env-context";
const inject = ["systemPrompt"];
const PLATFORM_NAMES = {
	win32: "Windows",
	darwin: "macOS",
	linux: "Linux"
};
/** win32 shell/文件规则，每条都是完整的模型向句子。 */
const WIN32_NOTES = [
	"cmd.exe defaults to codepage 936 (GBK): Chinese output may garble unless UTF-8 is active; run `chcp 65001` before Chinese I/O.",
	"PowerShell writes output with the console encoding; set [Console]::OutputEncoding to UTF-8 before Chinese I/O. Under ConstrainedLanguage, .NET static calls, Add-Type, and COM are unavailable.",
	"Write and read files as UTF-8 (no BOM); keep file paths, identifiers, and shell commands untranslated."
];
const POSIX_NOTES = ["Ensure a UTF-8 locale (LANG/LC_ALL) so Chinese output is not garbled.", "Quote file paths containing spaces; keep file paths, identifiers, and shell commands untranslated."];
/** 语言偏好规则：中文回复/中文思考，代码与命令保持原样。 */
const LANGUAGE_NOTES = ["Language preference: respond to the user in Chinese (Simplified). Prefer reasoning/thinking in Chinese as well; keep code, shell commands, identifiers, file paths, and quoted log excerpts untranslated."];
const Config = z.object({
	timeZone: z.string(),
	includeSeconds: z.boolean(),
	notes: z.array(z.string())
});
/** 探测单个 PowerShell 可执行文件的版本（$PSVersionTable.PSVersion），失败返回 undefined。 */
function probePowerShell(exe) {
	try {
		const result = spawnSync(exe, [
			"-NoProfile",
			"-NonInteractive",
			"-Command",
			"$PSVersionTable.PSVersion.ToString()"
		], {
			encoding: "utf8",
			timeout: 5e3,
			windowsHide: true
		});
		if (result.error || result.status !== 0) return void 0;
		const version = result.stdout.trim();
		return version === "" ? void 0 : {
			exe,
			version
		};
	} catch {
		return;
	}
}
/** 枚举 PATH 上某可执行文件名的全部副本（where.exe）；where 不可用时退回按名探测第一个。 */
function whereExe(exe) {
	try {
		const result = spawnSync("where.exe", [exe], {
			encoding: "utf8",
			timeout: 5e3,
			windowsHide: true
		});
		if (result.error || result.status !== 0) return [exe];
		const paths = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "");
		return paths.length > 0 ? paths : [exe];
	} catch {
		return [exe];
	}
}
/**
* 探测本机全部 PowerShell 及其实测版本号：枚举 PATH 上每个 pwsh.exe /
* powershell.exe 副本，逐个问 $PSVersionTable——版本号完全以实测为准，
* 6.x / 7.x / 5.1 或多版本并装都能如实列出（同版本多副本只记一条）。
* 仅 win32 调用。
*/
function detectPowerShells() {
	const seen = /* @__PURE__ */ new Set();
	const probes = [];
	for (const exe of ["pwsh.exe", "powershell.exe"]) for (const path of whereExe(exe)) {
		const probe = probePowerShell(path);
		if (probe === void 0) continue;
		const key = `${probe.version}`;
		if (seen.has(key)) continue;
		seen.add(key);
		probes.push({
			exe: path,
			version: probe.version
		});
	}
	return probes;
}
function detectShell(platform, powerShells) {
	if (platform === "win32") {
		const psLabel = powerShells.length > 0 ? powerShells.map((ps) => {
			const base = ps.exe.split(/[\\/]/).pop() ?? ps.exe;
			return `PowerShell ${ps.version} (${base})`;
		}).join(" / ") : "PowerShell (version unknown)";
		const hasCmd = process.env["ComSpec"] !== void 0 && /cmd(?:\.exe)?$/i.test(process.env["ComSpec"] ?? "");
		const hasPowerShell = process.env["PSModulePath"] !== void 0;
		if (hasCmd && hasPowerShell) return `cmd.exe / ${psLabel}`;
		if (hasPowerShell) return psLabel;
		return "cmd.exe";
	}
	return process.env["SHELL"] ?? "bash";
}
function renderEnvironmentText(platform, arch, nodeVersion, shell, cwd, timestamp, notes) {
	return [
		`Environment: ${PLATFORM_NAMES[platform] ?? platform} (${platform} ${arch}), Node ${nodeVersion}, shell: ${shell}.`,
		`Working directory: ${cwd}.`,
		`Current time: ${timestamp}.`,
		"Shell and file notes:",
		...notes.map((note) => `- ${note}`)
	].join("\n");
}
function renderTimestamp(config) {
	const includeSeconds = config.includeSeconds ?? false;
	const formatter = createTimestampFormatter(config.timeZone, includeSeconds);
	const timeZone = formatter.resolvedOptions().timeZone;
	return { text: formatTimestamp(Date.now(), formatter, timeZone, includeSeconds) };
}
function apply(ctx, config = {}) {
	let formatter;
	try {
		formatter = createTimestampFormatter(config.timeZone);
	} catch (error) {
		const message = config.timeZone === void 0 ? "dsh-env-context: failed to resolve the system time zone" : `dsh-env-context: invalid IANA timeZone ${JSON.stringify(config.timeZone)}`;
		throw new Error(message, { cause: error });
	}
	const timeZone = formatter.resolvedOptions().timeZone;
	const includeSeconds = config.includeSeconds ?? false;
	const notes = [
		...process.platform === "win32" ? WIN32_NOTES : POSIX_NOTES,
		...LANGUAGE_NOTES,
		...config.notes ?? []
	];
	const powerShells = process.platform === "win32" ? detectPowerShells() : [];
	const shell = detectShell(process.platform, powerShells);
	ctx.systemPrompt.context({
		name: "runtime:environment",
		order: 105,
		text: (context) => {
			const cwd = context.agent?.session.header.cwd ?? process.cwd();
			const { text } = renderTimestamp({
				...config,
				timeZone,
				includeSeconds
			});
			return renderEnvironmentText(process.platform, process.arch, process.version, shell, cwd, text, notes);
		}
	});
}
//#endregion
export { Config, apply, inject, name, renderEnvironmentText };
