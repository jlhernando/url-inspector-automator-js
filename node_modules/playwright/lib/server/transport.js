"use strict";
/**
 * Copyright 2018 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketTransport = void 0;
const WebSocket = require("ws");
const utils_1 = require("../utils/utils");
class WebSocketTransport {
    constructor(progress, url) {
        this._ws = new WebSocket(url, [], {
            perMessageDeflate: false,
            maxPayload: 256 * 1024 * 1024,
            handshakeTimeout: progress.timeUntilDeadline(),
        });
        this._progress = progress;
        // The 'ws' module in node sometimes sends us multiple messages in a single task.
        // In Web, all IO callbacks (e.g. WebSocket callbacks)
        // are dispatched into separate tasks, so there's no need
        // to do anything extra.
        const messageWrap = utils_1.makeWaitForNextTask();
        this._ws.addEventListener('message', event => {
            messageWrap(() => {
                if (this.onmessage)
                    this.onmessage.call(null, JSON.parse(event.data));
            });
        });
        this._ws.addEventListener('close', event => {
            this._progress && this._progress.log(`<ws disconnected> ${url}`);
            if (this.onclose)
                this.onclose.call(null);
        });
        // Prevent Error: read ECONNRESET.
        this._ws.addEventListener('error', () => { });
    }
    static async connect(progress, url) {
        progress.log(`<ws connecting> ${url}`);
        const transport = new WebSocketTransport(progress, url);
        let success = false;
        progress.aborted.then(() => {
            if (!success)
                transport.closeAndWait().catch(e => null);
        });
        await new Promise((fulfill, reject) => {
            transport._ws.addEventListener('open', async () => {
                progress.log(`<ws connected> ${url}`);
                fulfill(transport);
            });
            transport._ws.addEventListener('error', event => {
                progress.log(`<ws connect error> ${url} ${event.message}`);
                reject(new Error('WebSocket error: ' + event.message));
                transport._ws.close();
            });
        });
        success = true;
        return transport;
    }
    send(message) {
        this._ws.send(JSON.stringify(message));
    }
    close() {
        this._progress && this._progress.log(`<ws disconnecting> ${this._ws.url}`);
        this._ws.close();
    }
    async closeAndWait() {
        const promise = new Promise(f => this.onclose = f);
        this.close();
        return promise; // Make sure to await the actual disconnect.
    }
}
exports.WebSocketTransport = WebSocketTransport;
//# sourceMappingURL=transport.js.map