import {replaceState} from '$app/navigation';
import {page} from '$app/state';

/**
 * Replace the address bar's URL without a navigation or a new history entry: SvelteKit's
 * shallow-routing `replaceState`, which is `history.replaceState` kept in step with its router.
 * The playground uses it to drop a shared link's `project` key once the link has been dealt with.
 *
 * `page.state` is passed through unchanged, as `openFromNotification` does.
 */
export function replaceLocation(url: string): void {
	replaceState(url, page.state);
}
