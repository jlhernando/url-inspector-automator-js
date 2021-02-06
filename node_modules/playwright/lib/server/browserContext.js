"use strict";
/**
 * Copyright 2017 Google Inc. All rights reserved.
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
exports.normalizeProxySettings = exports.verifyGeolocation = exports.validateBrowserContextOptions = exports.assertBrowserContextIsNotOwned = exports.BrowserContext = exports.contextListeners = exports.runAction = exports.Video = void 0;
const events_1 = require("events");
const timeoutSettings_1 = require("../utils/timeoutSettings");
const utils_1 = require("../utils/utils");
const helper_1 = require("./helper");
const network = require("./network");
const page_1 = require("./page");
const progress_1 = require("./progress");
const selectors_1 = require("./selectors");
const path = require("path");
class Video {
    constructor(context, videoId, p) {
        this._finishCallback = () => { };
        this._videoId = videoId;
        this._path = p;
        this._relativePath = path.relative(context._options.recordVideo.dir, p);
        this._context = context;
        this._finishedPromise = new Promise(fulfill => this._finishCallback = fulfill);
    }
    async _finish() {
        if (this._callbackOnFinish)
            await this._callbackOnFinish();
        this._finishCallback();
    }
    _waitForCallbackOnFinish(callback) {
        this._callbackOnFinish = callback;
    }
}
exports.Video = Video;
async function runAction(task, metadata) {
    const controller = new progress_1.ProgressController();
    controller.setListener(async (result) => {
        for (const listener of metadata.page._browserContext._actionListeners)
            await listener.onAfterAction(result, metadata);
    });
    const result = await task(controller);
    return result;
}
exports.runAction = runAction;
exports.contextListeners = new Set();
class BrowserContext extends events_1.EventEmitter {
    constructor(browser, options, browserContextId) {
        super();
        this._timeoutSettings = new timeoutSettings_1.TimeoutSettings();
        this._pageBindings = new Map();
        this._closedStatus = 'open';
        this._permissions = new Map();
        this._downloads = new Set();
        this._actionListeners = new Set();
        this._origins = new Set();
        this._browser = browser;
        this._options = options;
        this._browserContextId = browserContextId;
        this._isPersistentContext = !browserContextId;
        this._closePromise = new Promise(fulfill => this._closePromiseFulfill = fulfill);
    }
    _setSelectors(selectors) {
        this._selectors = selectors;
    }
    selectors() {
        return this._selectors || selectors_1.serverSelectors;
    }
    async _initialize() {
        for (const listener of exports.contextListeners)
            await listener.onContextCreated(this);
    }
    async _ensureVideosPath() {
        if (this._options.recordVideo)
            await utils_1.mkdirIfNeeded(path.join(this._options.recordVideo.dir, 'dummy'));
    }
    _browserClosed() {
        for (const page of this.pages())
            page._didClose();
        this._didCloseInternal();
    }
    _didCloseInternal() {
        if (this._closedStatus === 'closed') {
            // We can come here twice if we close browser context and browser
            // at the same time.
            return;
        }
        this._closedStatus = 'closed';
        this._downloads.clear();
        this._closePromiseFulfill(new Error('Context closed'));
        this.emit(BrowserContext.Events.Close);
    }
    async cookies(urls = []) {
        if (urls && !Array.isArray(urls))
            urls = [urls];
        return await this._doCookies(urls);
    }
    setHTTPCredentials(httpCredentials) {
        return this._doSetHTTPCredentials(httpCredentials);
    }
    async exposeBinding(name, needsHandle, playwrightBinding) {
        const identifier = page_1.PageBinding.identifier(name, 'main');
        if (this._pageBindings.has(identifier))
            throw new Error(`Function "${name}" has been already registered`);
        for (const page of this.pages()) {
            if (page.getBinding(name, 'main'))
                throw new Error(`Function "${name}" has been already registered in one of the pages`);
        }
        const binding = new page_1.PageBinding(name, playwrightBinding, needsHandle, 'main');
        this._pageBindings.set(identifier, binding);
        this._doExposeBinding(binding);
    }
    async grantPermissions(permissions, origin) {
        let resolvedOrigin = '*';
        if (origin) {
            const url = new URL(origin);
            resolvedOrigin = url.origin;
        }
        const existing = new Set(this._permissions.get(resolvedOrigin) || []);
        permissions.forEach(p => existing.add(p));
        const list = [...existing.values()];
        this._permissions.set(resolvedOrigin, list);
        await this._doGrantPermissions(resolvedOrigin, list);
    }
    async clearPermissions() {
        this._permissions.clear();
        await this._doClearPermissions();
    }
    setDefaultNavigationTimeout(timeout) {
        this._timeoutSettings.setDefaultNavigationTimeout(timeout);
    }
    setDefaultTimeout(timeout) {
        this._timeoutSettings.setDefaultTimeout(timeout);
    }
    async _loadDefaultContextAsIs(progress) {
        if (!this.pages().length) {
            const waitForEvent = helper_1.helper.waitForEvent(progress, this, BrowserContext.Events.Page);
            progress.cleanupWhenAborted(() => waitForEvent.dispose);
            await waitForEvent.promise;
        }
        const pages = this.pages();
        await pages[0].mainFrame()._waitForLoadState(progress, 'load');
        return pages;
    }
    async _loadDefaultContext(progress) {
        const pages = await this._loadDefaultContextAsIs(progress);
        if (pages.length !== 1 || pages[0].mainFrame().url() !== 'about:blank')
            throw new Error(`Arguments can not specify page to be opened (first url is ${pages[0].mainFrame().url()})`);
        if (this._options.isMobile || this._options.locale) {
            // Workaround for:
            // - chromium fails to change isMobile for existing page;
            // - webkit fails to change locale for existing page.
            const oldPage = pages[0];
            await this.newPage();
            await oldPage.close();
        }
    }
    _authenticateProxyViaHeader() {
        const proxy = this._options.proxy || this._browser._options.proxy || { username: undefined, password: undefined };
        const { username, password } = proxy;
        if (username) {
            this._options.httpCredentials = { username, password: password };
            const token = Buffer.from(`${username}:${password}`).toString('base64');
            this._options.extraHTTPHeaders = network.mergeHeaders([
                this._options.extraHTTPHeaders,
                network.singleHeader('Proxy-Authorization', `Basic ${token}`),
            ]);
        }
    }
    _authenticateProxyViaCredentials() {
        const proxy = this._options.proxy || this._browser._options.proxy;
        if (!proxy)
            return;
        const { username, password } = proxy;
        if (username)
            this._options.httpCredentials = { username, password: password || '' };
    }
    async _setRequestInterceptor(handler) {
        this._requestInterceptor = handler;
        await this._doUpdateRequestInterception();
    }
    isClosingOrClosed() {
        return this._closedStatus !== 'open';
    }
    async close() {
        if (this._closedStatus === 'open') {
            this._closedStatus = 'closing';
            for (const listener of exports.contextListeners)
                await listener.onContextWillDestroy(this);
            // Collect videos/downloads that we will await.
            const promises = [];
            for (const download of this._downloads)
                promises.push(download.delete());
            for (const video of this._browser._idToVideo.values()) {
                if (video._context === this)
                    promises.push(video._finishedPromise);
            }
            if (this._isPersistentContext) {
                // Close all the pages instead of the context,
                // because we cannot close the default context.
                await Promise.all(this.pages().map(page => page.close()));
            }
            else {
                // Close the context.
                await this._doClose();
            }
            // Wait for the videos/downloads to finish.
            await Promise.all(promises);
            // Persistent context should also close the browser.
            if (this._isPersistentContext)
                await this._browser.close();
            // Bookkeeping.
            for (const listener of exports.contextListeners)
                await listener.onContextDidDestroy(this);
            this._didCloseInternal();
        }
        await this._closePromise;
    }
    async newPage() {
        const pageDelegate = await this.newPageDelegate();
        const pageOrError = await pageDelegate.pageOrError();
        if (pageOrError instanceof page_1.Page) {
            if (pageOrError.isClosed())
                throw new Error('Page has been closed.');
            return pageOrError;
        }
        throw pageOrError;
    }
    addVisitedOrigin(origin) {
        this._origins.add(origin);
    }
    async storageState() {
        const result = {
            cookies: (await this.cookies()).filter(c => c.value !== ''),
            origins: []
        };
        if (this._origins.size) {
            const page = await this.newPage();
            await page._setServerRequestInterceptor(handler => {
                handler.fulfill({ body: '<html></html>' }).catch(() => { });
            });
            for (const origin of this._origins) {
                const originStorage = { origin, localStorage: [] };
                result.origins.push(originStorage);
                const frame = page.mainFrame();
                await frame.goto(new progress_1.ProgressController(), origin);
                const storage = await frame._evaluateExpression(`({
          localStorage: Object.keys(localStorage).map(name => ({ name, value: localStorage.getItem(name) })),
        })`, false, undefined, 'utility');
                originStorage.localStorage = storage.localStorage;
            }
            await page.close();
        }
        return result;
    }
    async setStorageState(state) {
        if (state.cookies)
            await this.addCookies(state.cookies);
        if (state.origins && state.origins.length) {
            const page = await this.newPage();
            await page._setServerRequestInterceptor(handler => {
                handler.fulfill({ body: '<html></html>' }).catch(() => { });
            });
            for (const originState of state.origins) {
                const frame = page.mainFrame();
                await frame.goto(new progress_1.ProgressController(), originState.origin);
                await frame._evaluateExpression(`
          originState => {
            for (const { name, value } of (originState.localStorage || []))
              localStorage.setItem(name, value);
          }`, true, originState, 'utility');
            }
            await page.close();
        }
    }
    async extendInjectedScript(source, arg) {
        const installInFrame = (frame) => frame.extendInjectedScript(source, arg).catch(e => { });
        const installInPage = (page) => {
            page.on(page_1.Page.Events.InternalFrameNavigatedToNewDocument, installInFrame);
            return Promise.all(page.frames().map(installInFrame));
        };
        this.on(BrowserContext.Events.Page, installInPage);
        return Promise.all(this.pages().map(installInPage));
    }
}
exports.BrowserContext = BrowserContext;
BrowserContext.Events = {
    Close: 'close',
    Page: 'page',
    VideoStarted: 'videostarted',
};
function assertBrowserContextIsNotOwned(context) {
    for (const page of context.pages()) {
        if (page._ownedContext)
            throw new Error('Please use browser.newContext() for multi-page scripts that share the context.');
    }
}
exports.assertBrowserContextIsNotOwned = assertBrowserContextIsNotOwned;
function validateBrowserContextOptions(options, browserOptions) {
    if (options.noDefaultViewport && options.deviceScaleFactor !== undefined)
        throw new Error(`"deviceScaleFactor" option is not supported with null "viewport"`);
    if (options.noDefaultViewport && options.isMobile !== undefined)
        throw new Error(`"isMobile" option is not supported with null "viewport"`);
    if (!options.viewport && !options.noDefaultViewport)
        options.viewport = { width: 1280, height: 720 };
    if (options.proxy) {
        if (!browserOptions.proxy)
            throw new Error(`Browser needs to be launched with the global proxy. If all contexts override the proxy, global proxy will be never used and can be any string, for example "launch({ proxy: { server: 'per-context' } })"`);
        options.proxy = normalizeProxySettings(options.proxy);
    }
    verifyGeolocation(options.geolocation);
}
exports.validateBrowserContextOptions = validateBrowserContextOptions;
function verifyGeolocation(geolocation) {
    if (!geolocation)
        return;
    geolocation.accuracy = geolocation.accuracy || 0;
    const { longitude, latitude, accuracy } = geolocation;
    if (longitude < -180 || longitude > 180)
        throw new Error(`geolocation.longitude: precondition -180 <= LONGITUDE <= 180 failed.`);
    if (latitude < -90 || latitude > 90)
        throw new Error(`geolocation.latitude: precondition -90 <= LATITUDE <= 90 failed.`);
    if (accuracy < 0)
        throw new Error(`geolocation.accuracy: precondition 0 <= ACCURACY failed.`);
}
exports.verifyGeolocation = verifyGeolocation;
function normalizeProxySettings(proxy) {
    let { server, bypass } = proxy;
    let url;
    try {
        // new URL('127.0.0.1:8080') throws
        // new URL('localhost:8080') fails to parse host or protocol
        // In both of these cases, we need to try re-parse URL with `http://` prefix.
        url = new URL(server);
        if (!url.host || !url.protocol)
            url = new URL('http://' + server);
    }
    catch (e) {
        url = new URL('http://' + server);
    }
    server = url.protocol + '//' + url.host;
    if (bypass)
        bypass = bypass.split(',').map(t => t.trim()).join(',');
    return { ...proxy, server, bypass };
}
exports.normalizeProxySettings = normalizeProxySettings;
//# sourceMappingURL=browserContext.js.map