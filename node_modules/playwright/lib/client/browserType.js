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
exports.RemoteBrowser = exports.BrowserType = void 0;
const browser_1 = require("./browser");
const browserContext_1 = require("./browserContext");
const channelOwner_1 = require("./channelOwner");
const WebSocket = require("ws");
const path = require("path");
const fs = require("fs");
const connection_1 = require("./connection");
const serializers_1 = require("../protocol/serializers");
const events_1 = require("./events");
const timeoutSettings_1 = require("../utils/timeoutSettings");
const clientHelper_1 = require("./clientHelper");
const utils_1 = require("../utils/utils");
const selectors_1 = require("./selectors");
const errors_1 = require("../utils/errors");
const stream_1 = require("./stream");
class BrowserType extends channelOwner_1.ChannelOwner {
    constructor(parent, type, guid, initializer) {
        super(parent, type, guid, initializer);
        this._timeoutSettings = new timeoutSettings_1.TimeoutSettings();
    }
    static from(browserType) {
        return browserType._object;
    }
    executablePath() {
        if (!this._initializer.executablePath)
            throw new Error('Browser is not supported on current platform');
        return this._initializer.executablePath;
    }
    name() {
        return this._initializer.name;
    }
    async launch(options = {}) {
        const logger = options.logger;
        return this._wrapApiCall('browserType.launch', async () => {
            utils_1.assert(!options.userDataDir, 'userDataDir option is not supported in `browserType.launch`. Use `browserType.launchPersistentContext` instead');
            utils_1.assert(!options.port, 'Cannot specify a port without launching as a server.');
            const launchOptions = {
                ...options,
                ignoreDefaultArgs: Array.isArray(options.ignoreDefaultArgs) ? options.ignoreDefaultArgs : undefined,
                ignoreAllDefaultArgs: !!options.ignoreDefaultArgs && !Array.isArray(options.ignoreDefaultArgs),
                env: options.env ? clientHelper_1.envObjectToArray(options.env) : undefined,
            };
            const browser = browser_1.Browser.from((await this._channel.launch(launchOptions)).browser);
            browser._logger = logger;
            return browser;
        }, logger);
    }
    async launchServer(options = {}) {
        if (!this._serverLauncher)
            throw new Error('Launching server is not supported');
        return this._serverLauncher.launchServer(options);
    }
    async launchPersistentContext(userDataDir, options = {}) {
        return this._wrapApiCall('browserType.launchPersistentContext', async () => {
            utils_1.assert(!options.port, 'Cannot specify a port without launching as a server.');
            const contextOptions = await browserContext_1.prepareBrowserContextOptions(options);
            const persistentOptions = {
                ...contextOptions,
                ignoreDefaultArgs: Array.isArray(options.ignoreDefaultArgs) ? options.ignoreDefaultArgs : undefined,
                ignoreAllDefaultArgs: !!options.ignoreDefaultArgs && !Array.isArray(options.ignoreDefaultArgs),
                env: options.env ? clientHelper_1.envObjectToArray(options.env) : undefined,
                userDataDir,
            };
            const result = await this._channel.launchPersistentContext(persistentOptions);
            const context = browserContext_1.BrowserContext.from(result.context);
            context._options = contextOptions;
            context._logger = options.logger;
            return context;
        }, options.logger);
    }
    async connect(params) {
        const logger = params.logger;
        return this._wrapApiCall('browserType.connect', async () => {
            const connection = new connection_1.Connection();
            const ws = new WebSocket(params.wsEndpoint, [], {
                perMessageDeflate: false,
                maxPayload: 256 * 1024 * 1024,
                handshakeTimeout: this._timeoutSettings.timeout(params),
            });
            // The 'ws' module in node sometimes sends us multiple messages in a single task.
            const waitForNextTask = params.slowMo
                ? (cb) => setTimeout(cb, params.slowMo)
                : utils_1.makeWaitForNextTask();
            connection.onmessage = message => {
                if (ws.readyState !== WebSocket.OPEN) {
                    setTimeout(() => {
                        connection.dispatch({ id: message.id, error: serializers_1.serializeError(new Error(errors_1.kBrowserClosedError)) });
                    }, 0);
                    return;
                }
                ws.send(JSON.stringify(message));
            };
            ws.addEventListener('message', event => {
                waitForNextTask(() => connection.dispatch(JSON.parse(event.data)));
            });
            return await new Promise(async (fulfill, reject) => {
                if (params.__testHookBeforeCreateBrowser) {
                    try {
                        await params.__testHookBeforeCreateBrowser();
                    }
                    catch (e) {
                        reject(e);
                    }
                }
                ws.addEventListener('open', async () => {
                    const prematureCloseListener = (event) => {
                        reject(new Error('Server disconnected: ' + event.reason));
                    };
                    ws.addEventListener('close', prematureCloseListener);
                    const remoteBrowser = await connection.waitForObjectWithKnownName('remoteBrowser');
                    // Inherit shared selectors for connected browser.
                    const selectorsOwner = selectors_1.SelectorsOwner.from(remoteBrowser._initializer.selectors);
                    selectors_1.sharedSelectors._addChannel(selectorsOwner);
                    const browser = browser_1.Browser.from(remoteBrowser._initializer.browser);
                    browser._logger = logger;
                    browser._isRemote = true;
                    const closeListener = () => {
                        // Emulate all pages, contexts and the browser closing upon disconnect.
                        for (const context of browser.contexts()) {
                            for (const page of context.pages())
                                page._onClose();
                            context._onClose();
                        }
                        browser._didClose();
                    };
                    ws.removeEventListener('close', prematureCloseListener);
                    ws.addEventListener('close', closeListener);
                    browser.on(events_1.Events.Browser.Disconnected, () => {
                        selectors_1.sharedSelectors._removeChannel(selectorsOwner);
                        ws.removeEventListener('close', closeListener);
                        ws.close();
                    });
                    fulfill(browser);
                });
                ws.addEventListener('error', event => {
                    ws.close();
                    reject(new Error(event.message + '. Most likely ws endpoint is incorrect'));
                });
            });
        }, logger);
    }
}
exports.BrowserType = BrowserType;
class RemoteBrowser extends channelOwner_1.ChannelOwner {
    constructor(parent, type, guid, initializer) {
        super(parent, type, guid, initializer);
        this._channel.on('video', ({ context, stream, relativePath }) => this._onVideo(browserContext_1.BrowserContext.from(context), stream_1.Stream.from(stream), relativePath));
    }
    async _onVideo(context, stream, relativePath) {
        const videoFile = path.join(context._options.recordVideo.dir, relativePath);
        await utils_1.mkdirIfNeeded(videoFile);
        stream.stream().pipe(fs.createWriteStream(videoFile));
    }
}
exports.RemoteBrowser = RemoteBrowser;
//# sourceMappingURL=browserType.js.map