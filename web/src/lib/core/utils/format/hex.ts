// Copied from jolly-roger web/src/lib/core/utils/format/hex.ts, at commit 8a73e680; nothing below this line is changed.
/**
 * Truncation options for hex strings (addresses, hashes).
 * `start`/`end` are counts of hex characters kept AFTER the `0x` prefix.
 */
export type TruncateHexOptions = {start: number; end: number};

/**
 * Truncate a hex string (address, tx hash, ...) for display, keeping the
 * `0x` prefix, `start` characters after it, and `end` characters at the tail.
 *
 * @example
 * truncateHex('0x1234567890abcdef1234567890abcdef12345678') // "0x1234...5678"
 * truncateHex('0xabcdef...', {start: 6, end: 6})            // "0xabcdef...abcdef"
 */
export function truncateHex(
	value: string,
	{start, end}: TruncateHexOptions = {start: 4, end: 4},
): string {
	if (!value) return '';
	// Not long enough to benefit from truncation.
	if (value.length <= 2 + start + end) return value;
	return `${value.slice(0, 2 + start)}...${value.slice(-end)}`;
}
