/**
 * The runner worker: runs the reader's deploy scripts. User code runs HERE, never on the page.
 *
 * `./log-hook.js` is the FIRST import, so rocketh's named-logs factory exists before any rocketh
 * module is evaluated (they are all loaded later, per run).
 */
import './log-hook.js';
import {serveRunner} from './runner-host.js';

serveRunner(self as unknown as Parameters<typeof serveRunner>[0]);
