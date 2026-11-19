/**
 * The validation loop of jolly-roger's `web/src/routes/contracts/components/FunctionInputs.svelte`
 * (commit 8a73e680), moved out of the component's `$effect` into a plain function, as this
 * repository's conventions ask (logic in `.ts`, the component only wires it).
 *
 * One change from the original: an `address` input is validated here like any other type. In
 * jolly-roger it is skipped because `AddressInput.svelte` validates itself; the playground renders
 * a plain input instead (that component brings ENS and a block explorer, which an in-tab chain has
 * neither of), so `validateInputValue`'s own `address` case applies.
 *
 * Nothing here is specific to the playground: it would sit as well in jolly-roger.
 */
import type {AbiParameter} from 'viem';
import {getInputKey, validateInputValue} from './utils';

/** Write each input's error into `errors` (a component's `$state` object), or delete it when valid. */
export function syncInputErrors(
	inputs: readonly AbiParameter[],
	values: Record<string, unknown>,
	errors: Record<string, string>,
): void {
	for (const [index, input] of inputs.entries()) {
		const key = getInputKey(input, index);
		if (values[key] !== undefined) {
			const validation = validateInputValue(input.type, String(values[key]));
			if (!validation.valid && validation.error) {
				errors[key] = validation.error;
			} else {
				delete errors[key];
			}
		}
	}
}
