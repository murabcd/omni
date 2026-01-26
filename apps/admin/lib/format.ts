export function formatMs(ms?: number | null): string {
	if (!ms && ms !== 0) return "n/a";
	return new Date(ms).toLocaleString();
}

export function formatAgo(ms?: number | null): string {
	if (!ms && ms !== 0) return "n/a";
	const diff = Date.now() - ms;
	if (diff < 0) return "just now";
	const sec = Math.round(diff / 1000);
	if (sec < 60) return `${sec}s ago`;
	const min = Math.round(sec / 60);
	if (min < 60) return `${min}m ago`;
	const hr = Math.round(min / 60);
	if (hr < 48) return `${hr}h ago`;
	const day = Math.round(hr / 24);
	return `${day}d ago`;
}

export function formatDurationMs(ms?: number | null): string {
	if (!ms && ms !== 0) return "n/a";
	if (ms < 1000) return `${ms}ms`;
	const sec = Math.round(ms / 1000);
	if (sec < 60) return `${sec}s`;
	const min = Math.round(sec / 60);
	if (min < 60) return `${min}m`;
	const hr = Math.round(min / 60);
	if (hr < 48) return `${hr}h`;
	const day = Math.round(hr / 24);
	return `${day}d`;
}

export function toNumber(value: string, fallback: number): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}
