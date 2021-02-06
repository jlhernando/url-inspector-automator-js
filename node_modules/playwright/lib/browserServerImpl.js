"use strict";
/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License");
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
exports.BrowserServerImpl = exports.BrowserServerLauncherImpl = void 0;
const ws = require("ws");
const fs = require("fs");
const ws_1 = require("ws");
const dispatcher_1 = require("./dispatchers/dispatcher");
const browserDispatcher_1 = require("./dispatchers/browserDispatcher");
const clientHelper_1 = require("./client/clientHelper");
const utils_1 = require("./utils/utils");
const selectorsDispatcher_1 = require("./dispatchers/selectorsDispatcher");
const selectors_1 = require("./server/selectors");
const browserContext_1 = require("./server/browserContext");
const streamDispatcher_1 = require("./dispatchers/streamDispatcher");
class BrowserServerLauncherImpl {
    constructor(browserType) {
        this._browserType = browserType;
    }
    async launchServer(options = {}) {
        const browser = await this._browserType.launch({
            ...options,
            ignoreDefaultArgs: Array.isArray(options.ignoreDefaultArgs) ? options.ignoreDefaultArgs : undefined,
            ignoreAllDefaultArgs: !!options.ignoreDefaultArgs && !Array.isArray(options.ignoreDefaultArgs),
            env: options.env ? clientHelper_1.envObjectToArray(options.env) : undefined,
        }, toProtocolLogger(options.logger));
        return BrowserServerImpl.start(browser, options.port);
    }
}
exports.BrowserServerLauncherImpl = BrowserServerLauncherImpl;
class BrowserServerImpl extends ws_1.EventEmitter {
    constructor(browser, port) {
        super();
        this._browser = browser;
        this._wsEndpoint = '';
        this._process = browser._options.browserProcess.process;
        let readyCallback = () => { };
        this._ready = new Promise(f => readyCallback = f);
        const token = utils_1.createGuid();
        this._server = new ws.Server({ port, path: '/' + token }, () => {
            const address = this._server.address();
            this._wsEndpoint = typeof address === 'string' ? `${address}/${token}` : `ws://127.0.0.1:${address.port}/${token}`;
            readyCallback();
        });
        this._server.on('connection', (socket, req) => {
            this._clientAttached(socket);
        });
        browser._options.browserProcess.onclose = (exitCode, signal) => {
            this._server.close();
            this.emit('close', exitCode, signal);
        };
    }
    static async start(browser, port = 0) {
        const server = new BrowserServerImpl(browser, port);
        await server._ready;
        return server;
    }
    process() {
        return this._process;
    }
    wsEndpoint() {
        return this._wsEndpoint;
    }
    async close() {
        await this._browser._options.browserProcess.close();
    }
    async kill() {
        await this._browser._options.browserProcess.kill();
    }
    _clientAttached(socket) {
        const connection = new dispatcher_1.DispatcherConnection();
        connection.onmessage = message => {
            if (socket.readyState !== ws.CLOSING)
                socket.send(JSON.stringify(message));
        };
        socket.on('message', (message) => {
            connection.dispatch(JSON.parse(Buffer.from(message).toString()));
        });
        socket.on('error', () => { });
        const selectors = new selectors_1.Selectors();
        const scope = connection.rootDispatcher();
        const remoteBrowser = new RemoteBrowserDispatcher(scope, this._browser, selectors);
        socket.on('close', () => {
            // Avoid sending any more messages over closed socket.
            connection.onmessage = () => { };
            // Cleanup contexts upon disconnect.
            remoteBrowser.connectedBrowser.close().catch(e => { });
        });
    }
}
exports.BrowserServerImpl = BrowserServerImpl;
class RemoteBrowserDispatcher extends dispatcher_1.Dispatcher {
    constructor(scope, browser, selectors) {
        const connectedBrowser = new ConnectedBrowser(scope, browser, selectors);
        super(scope, {}, 'RemoteBrowser', {
            selectors: new selectorsDispatcher_1.SelectorsDispatcher(scope, selectors),
            browser: connectedBrowser,
        }, false, 'remoteBrowser');
        this.connectedBrowser = connectedBrowser;
        connectedBrowser._remoteBrowser = this;
    }
}
class ConnectedBrowser extends browserDispatcher_1.BrowserDispatcher {
    constructor(scope, browser, selectors) {
        super(scope, browser);
        this._contexts = [];
        this._closed = false;
        this._selectors = selectors;
    }
    async newContext(params) {
        if (params.recordVideo) {
            // TODO: we should create a separate temp directory or accept a launchServer parameter.
            params.recordVideo.dir = this._object._options.downloadsPath;
        }
        const result = await super.newContext(params);
        const dispatcher = result.context;
        dispatcher._object.on(browserContext_1.BrowserContext.Events.VideoStarted, (video) => this._sendVideo(dispatcher, video));
        dispatcher._object._setSelectors(this._selectors);
        this._contexts.push(dispatcher);
        return result;
    }
    async close() {
        // Only close our own contexts.
        await Promise.all(this._contexts.map(context => context.close()));
        this._didClose();
    }
    _didClose() {
        if (!this._closed) {
            // We come here multiple times:
            // - from ConnectedBrowser.close();
            // - from underlying Browser.on('close').
            this._closed = true;
            super._didClose();
        }
    }
    _sendVideo(contextDispatcher, video) {
        video._waitForCallbackOnFinish(async () => {
            const readable = fs.createReadStream(video._path);
            await new Promise(f => readable.on('readable', f));
            const stream = new streamDispatcher_1.StreamDispatcher(this._remoteBrowser._scope, readable);
            this._remoteBrowser._dispatchEvent('video', {
                stream,
                context: contextDispatcher,
                relativePath: video._relativePath
            });
            await new Promise(resolve => {
                readable.on('close', resolve);
                readable.on('end', resolve);
                readable.on('error', resolve);
            });
        });
    }
}
function toProtocolLogger(logger) {
    return logger ? (direction, message) => {
        if (logger.isEnabled('protocol', 'verbose'))
            logger.log('protocol', 'verbose', (direction === 'send' ? 'SEND ► ' : '◀ RECV ') + JSON.stringify(message), [], {});
    } : undefined;
}
//# sourceMappingURL=browserServerImpl.js.map