"use strict";
/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProgressController = exports.runAbortableTask = void 0;
const errors_1 = require("../utils/errors");
const utils_1 = require("../utils/utils");
const stackTrace_1 = require("../utils/stackTrace");
const debugLogger_1 = require("../utils/debugLogger");
async function runAbortableTask(task, timeout) {
    const controller = new ProgressController();
    return controller.run(task, timeout);
}
exports.runAbortableTask = runAbortableTask;
class ProgressController {
    constructor() {
        // Promise and callback that forcefully abort the progress.
        // This promise always rejects.
        this._forceAbort = () => { };
        // Promise and callback that resolve once the progress is aborted.
        // This includes the force abort and also rejection of the task itself (failure).
        this._aborted = () => { };
        // Cleanups to be run only in the case of abort.
        this._cleanups = [];
        this._logName = 'api';
        this._state = 'before';
        this._deadline = 0;
        this._timeout = 0;
        this._logRecording = [];
        this._forceAbortPromise = new Promise((resolve, reject) => this._forceAbort = reject);
        this._forceAbortPromise.catch(e => null); // Prevent unhandle promsie rejection.
        this._abortedPromise = new Promise(resolve => this._aborted = resolve);
    }
    setLogName(logName) {
        this._logName = logName;
    }
    setListener(listener) {
        this._listener = listener;
    }
    async run(task, timeout) {
        if (timeout) {
            this._timeout = timeout;
            this._deadline = timeout ? utils_1.monotonicTime() + timeout : 0;
        }
        utils_1.assert(this._state === 'before');
        this._state = 'running';
        const progress = {
            aborted: this._abortedPromise,
            log: message => {
                if (this._state === 'running')
                    this._logRecording.push(message);
                debugLogger_1.debugLogger.log(this._logName, message);
            },
            timeUntilDeadline: () => this._deadline ? this._deadline - utils_1.monotonicTime() : 2147483647,
            isRunning: () => this._state === 'running',
            cleanupWhenAborted: (cleanup) => {
                if (this._state === 'running')
                    this._cleanups.push(cleanup);
                else
                    runCleanup(cleanup);
            },
            throwIfAborted: () => {
                if (this._state === 'aborted')
                    throw new AbortedError();
            },
        };
        const timeoutError = new errors_1.TimeoutError(`Timeout ${this._timeout}ms exceeded.`);
        const timer = setTimeout(() => this._forceAbort(timeoutError), progress.timeUntilDeadline());
        const startTime = utils_1.monotonicTime();
        try {
            const promise = task(progress);
            const result = await Promise.race([promise, this._forceAbortPromise]);
            clearTimeout(timer);
            this._state = 'finished';
            if (this._listener) {
                await this._listener({
                    startTime,
                    endTime: utils_1.monotonicTime(),
                    logs: this._logRecording,
                });
            }
            this._logRecording = [];
            return result;
        }
        catch (e) {
            this._aborted();
            clearTimeout(timer);
            this._state = 'aborted';
            await Promise.all(this._cleanups.splice(0).map(cleanup => runCleanup(cleanup)));
            if (this._listener) {
                await this._listener({
                    startTime,
                    endTime: utils_1.monotonicTime(),
                    logs: this._logRecording,
                    error: e,
                });
            }
            stackTrace_1.rewriteErrorMessage(e, e.message +
                formatLogRecording(this._logRecording) +
                kLoggingNote);
            this._logRecording = [];
            throw e;
        }
    }
    abort(error) {
        this._forceAbort(error);
    }
}
exports.ProgressController = ProgressController;
async function runCleanup(cleanup) {
    try {
        await cleanup();
    }
    catch (e) {
    }
}
const kLoggingNote = `\nNote: use DEBUG=pw:api environment variable and rerun to capture Playwright logs.`;
function formatLogRecording(log) {
    if (!log.length)
        return '';
    const header = ` logs `;
    const headerLength = 60;
    const leftLength = (headerLength - header.length) / 2;
    const rightLength = headerLength - header.length - leftLength;
    return `\n${'='.repeat(leftLength)}${header}${'='.repeat(rightLength)}\n${log.join('\n')}\n${'='.repeat(headerLength)}`;
}
class AbortedError extends Error {
}
//# sourceMappingURL=progress.js.map