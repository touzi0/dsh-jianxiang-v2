import z from "@deepseek-ai/schemastery";
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
const Config = z.object({
	timeZone: z.string(),
	includeSeconds: z.boolean(),
	notes: z.array(z.string())
});
function detectShell(platform) {
	if (platform === "win32") {
		const hasCmd = process.env["ComSpec"] !== void 0 && /cmd(?:\.exe)?$/i.test(process.env["ComSpec"] ?? "");
		const hasPowerShell = process.env["PSModulePath"] !== void 0;
		if (hasCmd && hasPowerShell) return "cmd.exe / PowerShell (pwsh)";
		if (hasPowerShell) return "PowerShell (pwsh)";
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
	const notes = [...process.platform === "win32" ? WIN32_NOTES : POSIX_NOTES, ...config.notes ?? []];
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
			return renderEnvironmentText(process.platform, process.arch, process.version, detectShell(process.platform), cwd, text, notes);
		}
	});
}
//#endregion
export { Config, apply, inject, name, renderEnvironmentText };
