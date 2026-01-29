export async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	handler: (item: T) => Promise<R>,
): Promise<R[]> {
	if (items.length === 0) return [];
	const concurrency = Math.max(1, Math.min(limit, items.length));
	const results: R[] = new Array(items.length);
	let cursor = 0;
	const workers = Array.from({ length: concurrency }, async () => {
		while (cursor < items.length) {
			const index = cursor;
			cursor += 1;
			results[index] = await handler(items[index]);
		}
	});
	await Promise.all(workers);
	return results;
}
