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
exports.BrowserContextDispatcher = void 0;
const browserContext_1 = require("../server/browserContext");
const dispatcher_1 = require("./dispatcher");
const pageDispatcher_1 = require("./pageDispatcher");
const networkDispatchers_1 = require("./networkDispatchers");
const crBrowser_1 = require("../server/chromium/crBrowser");
const cdpSessionDispatcher_1 = require("./cdpSessionDispatcher");
const jsHandleDispatcher_1 = require("./jsHandleDispatcher");
class BrowserContextDispatcher extends dispatcher_1.Dispatcher {
    constructor(scope, context) {
        super(scope, context, 'BrowserContext', { isChromium: context._browser._options.isChromium }, true);
        this._context = context;
        for (const page of context.pages())
            this._dispatchEvent('page', { page: new pageDispatcher_1.PageDispatcher(this._scope, page) });
        context.on(browserContext_1.BrowserContext.Events.Page, page => this._dispatchEvent('page', { page: new pageDispatcher_1.PageDispatcher(this._scope, page) }));
        context.on(browserContext_1.BrowserContext.Events.Close, () => {
            this._dispatchEvent('close');
            this._dispose();
        });
        if (context._browser._options.name === 'chromium') {
            for (const page of context.backgroundPages())
                this._dispatchEvent('crBackgroundPage', { page: new pageDispatcher_1.PageDispatcher(this._scope, page) });
            context.on(crBrowser_1.CRBrowserContext.CREvents.BackgroundPage, page => this._dispatchEvent('crBackgroundPage', { page: new pageDispatcher_1.PageDispatcher(this._scope, page) }));
            for (const serviceWorker of context.serviceWorkers())
                this._dispatchEvent('crServiceWorker', new pageDispatcher_1.WorkerDispatcher(this._scope, serviceWorker));
            context.on(crBrowser_1.CRBrowserContext.CREvents.ServiceWorker, serviceWorker => this._dispatchEvent('crServiceWorker', { worker: new pageDispatcher_1.WorkerDispatcher(this._scope, serviceWorker) }));
        }
    }
    async setDefaultNavigationTimeoutNoReply(params) {
        this._context.setDefaultNavigationTimeout(params.timeout);
    }
    async setDefaultTimeoutNoReply(params) {
        this._context.setDefaultTimeout(params.timeout);
    }
    async exposeBinding(params) {
        await this._context.exposeBinding(params.name, !!params.needsHandle, (source, ...args) => {
            const binding = new pageDispatcher_1.BindingCallDispatcher(this._scope, params.name, !!params.needsHandle, source, args);
            this._dispatchEvent('bindingCall', { binding });
            return binding.promise();
        });
    }
    async newPage() {
        return { page: dispatcher_1.lookupDispatcher(await this._context.newPage()) };
    }
    async cookies(params) {
        return { cookies: await this._context.cookies(params.urls) };
    }
    async addCookies(params) {
        await this._context.addCookies(params.cookies);
    }
    async clearCookies() {
        await this._context.clearCookies();
    }
    async grantPermissions(params) {
        await this._context.grantPermissions(params.permissions, params.origin);
    }
    async clearPermissions() {
        await this._context.clearPermissions();
    }
    async setGeolocation(params) {
        await this._context.setGeolocation(params.geolocation);
    }
    async setExtraHTTPHeaders(params) {
        await this._context.setExtraHTTPHeaders(params.headers);
    }
    async setOffline(params) {
        await this._context.setOffline(params.offline);
    }
    async setHTTPCredentials(params) {
        await this._context.setHTTPCredentials(params.httpCredentials);
    }
    async addInitScript(params) {
        await this._context._doAddInitScript(params.source);
    }
    async setNetworkInterceptionEnabled(params) {
        if (!params.enabled) {
            await this._context._setRequestInterceptor(undefined);
            return;
        }
        this._context._setRequestInterceptor((route, request) => {
            this._dispatchEvent('route', { route: new networkDispatchers_1.RouteDispatcher(this._scope, route), request: networkDispatchers_1.RequestDispatcher.from(this._scope, request) });
        });
    }
    async storageState() {
        return await this._context.storageState();
    }
    async close() {
        await this._context.close();
    }
    async extendInjectedScript(params) {
        await this._context.extendInjectedScript(params.source, jsHandleDispatcher_1.parseArgument(params.arg));
    }
    async crNewCDPSession(params) {
        if (!this._object._browser._options.isChromium)
            throw new Error(`CDP session is only available in Chromium`);
        const crBrowserContext = this._object;
        return { session: new cdpSessionDispatcher_1.CDPSessionDispatcher(this._scope, await crBrowserContext.newCDPSession(params.page._object)) };
    }
}
exports.BrowserContextDispatcher = BrowserContextDispatcher;
//# sourceMappingURL=browserContextDispatcher.js.map