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
exports.Browser = void 0;
const browserContext_1 = require("./browserContext");
const channelOwner_1 = require("./channelOwner");
const events_1 = require("./events");
const errors_1 = require("../utils/errors");
class Browser extends channelOwner_1.ChannelOwner {
    constructor(parent, type, guid, initializer) {
        super(parent, type, guid, initializer);
        this._contexts = new Set();
        this._isConnected = true;
        this._isRemote = false;
        this._channel.on('close', () => this._didClose());
        this._closedPromise = new Promise(f => this.once(events_1.Events.Browser.Disconnected, f));
    }
    static from(browser) {
        return browser._object;
    }
    static fromNullable(browser) {
        return browser ? Browser.from(browser) : null;
    }
    async newContext(options = {}) {
        return this._wrapApiCall('browser.newContext', async () => {
            if (this._isRemote && options._tracePath)
                throw new Error(`"_tracePath" is not supported in connected browser`);
            const contextOptions = await browserContext_1.prepareBrowserContextOptions(options);
            const context = browserContext_1.BrowserContext.from((await this._channel.newContext(contextOptions)).context);
            context._options = contextOptions;
            this._contexts.add(context);
            context._logger = options.logger || this._logger;
            return context;
        });
    }
    contexts() {
        return [...this._contexts];
    }
    version() {
        return this._initializer.version;
    }
    async newPage(options = {}) {
        const context = await this.newContext(options);
        const page = await context.newPage();
        page._ownedContext = context;
        context._ownerPage = page;
        return page;
    }
    isConnected() {
        return this._isConnected;
    }
    async close() {
        try {
            await this._wrapApiCall('browser.close', async () => {
                await this._channel.close();
                await this._closedPromise;
            });
        }
        catch (e) {
            if (errors_1.isSafeCloseError(e))
                return;
            throw e;
        }
    }
    _didClose() {
        this._isConnected = false;
        this.emit(events_1.Events.Browser.Disconnected);
    }
}
exports.Browser = Browser;
//# sourceMappingURL=browser.js.map