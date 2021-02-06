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
exports.PageBinding = exports.Worker = exports.Page = void 0;
const frames = require("./frames");
const input = require("./input");
const js = require("./javascript");
const screenshotter_1 = require("./screenshotter");
const timeoutSettings_1 = require("../utils/timeoutSettings");
const types = require("./types");
const browserContext_1 = require("./browserContext");
const console_1 = require("./console");
const accessibility = require("./accessibility");
const events_1 = require("events");
const fileChooser_1 = require("./fileChooser");
const progress_1 = require("./progress");
const utils_1 = require("../utils/utils");
const debugLogger_1 = require("../utils/debugLogger");
class Page extends events_1.EventEmitter {
    constructor(delegate, browserContext) {
        super();
        this._closedState = 'open';
        this._disconnected = false;
        this._pageBindings = new Map();
        this._evaluateOnNewDocumentSources = [];
        this._workers = new Map();
        this._video = null;
        this.setMaxListeners(0);
        this._delegate = delegate;
        this._closedCallback = () => { };
        this._closedPromise = new Promise(f => this._closedCallback = f);
        this._disconnectedCallback = () => { };
        this._disconnectedPromise = new Promise(f => this._disconnectedCallback = f);
        this._crashedCallback = () => { };
        this._crashedPromise = new Promise(f => this._crashedCallback = f);
        this._browserContext = browserContext;
        this._state = {
            viewportSize: browserContext._options.viewport || null,
            mediaType: null,
            colorScheme: null,
            extraHTTPHeaders: null,
        };
        this.accessibility = new accessibility.Accessibility(delegate.getAccessibilityTree.bind(delegate));
        this.keyboard = new input.Keyboard(delegate.rawKeyboard, this);
        this.mouse = new input.Mouse(delegate.rawMouse, this);
        this.touchscreen = new input.Touchscreen(delegate.rawTouchscreen, this);
        this._timeoutSettings = new timeoutSettings_1.TimeoutSettings(browserContext._timeoutSettings);
        this._screenshotter = new screenshotter_1.Screenshotter(this);
        this._frameManager = new frames.FrameManager(this);
        if (delegate.pdf)
            this.pdf = delegate.pdf.bind(delegate);
        this.coverage = delegate.coverage ? delegate.coverage() : null;
        this.selectors = browserContext.selectors();
    }
    async reportAsNew() {
        const pageOrError = await this._delegate.pageOrError();
        if (pageOrError instanceof Error) {
            // Initialization error could have happened because of
            // context/browser closure. Just ignore the page.
            if (this._browserContext.isClosingOrClosed())
                return;
            this._setIsError();
        }
        this._browserContext.emit(browserContext_1.BrowserContext.Events.Page, this);
        const openerDelegate = this._delegate.openerDelegate();
        if (openerDelegate) {
            openerDelegate.pageOrError().then(openerPage => {
                if (openerPage instanceof Page && !openerPage.isClosed())
                    openerPage.emit(Page.Events.Popup, this);
            });
        }
    }
    async _doSlowMo() {
        const slowMo = this._browserContext._browser._options.slowMo;
        if (!slowMo)
            return;
        await new Promise(x => setTimeout(x, slowMo));
    }
    _didClose() {
        this._frameManager.dispose();
        utils_1.assert(this._closedState !== 'closed', 'Page closed twice');
        this._closedState = 'closed';
        this.emit(Page.Events.Close);
        this._closedCallback();
    }
    _didCrash() {
        this._frameManager.dispose();
        this.emit(Page.Events.Crash);
        this._crashedCallback(new Error('Page crashed'));
    }
    _didDisconnect() {
        this._frameManager.dispose();
        utils_1.assert(!this._disconnected, 'Page disconnected twice');
        this._disconnected = true;
        this._disconnectedCallback(new Error('Page closed'));
    }
    async _onFileChooserOpened(handle) {
        const multiple = await handle.evaluate(element => !!element.multiple);
        if (!this.listenerCount(Page.Events.FileChooser)) {
            handle.dispose();
            return;
        }
        const fileChooser = new fileChooser_1.FileChooser(this, handle, multiple);
        this.emit(Page.Events.FileChooser, fileChooser);
    }
    context() {
        return this._browserContext;
    }
    async opener() {
        return await this._delegate.opener();
    }
    mainFrame() {
        return this._frameManager.mainFrame();
    }
    frames() {
        return this._frameManager.frames();
    }
    setDefaultNavigationTimeout(timeout) {
        this._timeoutSettings.setDefaultNavigationTimeout(timeout);
    }
    setDefaultTimeout(timeout) {
        this._timeoutSettings.setDefaultTimeout(timeout);
    }
    async exposeBinding(name, needsHandle, playwrightBinding, world = 'main') {
        const identifier = PageBinding.identifier(name, world);
        if (this._pageBindings.has(identifier))
            throw new Error(`Function "${name}" has been already registered`);
        if (this._browserContext._pageBindings.has(identifier))
            throw new Error(`Function "${name}" has been already registered in the browser context`);
        const binding = new PageBinding(name, playwrightBinding, needsHandle, world);
        this._pageBindings.set(identifier, binding);
        await this._delegate.exposeBinding(binding);
    }
    setExtraHTTPHeaders(headers) {
        this._state.extraHTTPHeaders = headers;
        return this._delegate.updateExtraHTTPHeaders();
    }
    async _onBindingCalled(payload, context) {
        if (this._disconnected || this._closedState === 'closed')
            return;
        await PageBinding.dispatch(this, payload, context);
    }
    _addConsoleMessage(type, args, location, text) {
        const message = new console_1.ConsoleMessage(type, text, args, location);
        const intercepted = this._frameManager.interceptConsoleMessage(message);
        if (intercepted || !this.listenerCount(Page.Events.Console))
            args.forEach(arg => arg.dispose());
        else
            this.emit(Page.Events.Console, message);
    }
    async reload(controller, options) {
        this.mainFrame().setupNavigationProgressController(controller);
        const response = await controller.run(async (progress) => {
            const waitPromise = this.mainFrame()._waitForNavigation(progress, options);
            await this._delegate.reload();
            return waitPromise;
        }, this._timeoutSettings.navigationTimeout(options));
        await this._doSlowMo();
        return response;
    }
    async goBack(controller, options) {
        this.mainFrame().setupNavigationProgressController(controller);
        const response = await controller.run(async (progress) => {
            const waitPromise = this.mainFrame()._waitForNavigation(progress, options);
            const result = await this._delegate.goBack();
            if (!result) {
                waitPromise.catch(() => { });
                return null;
            }
            return waitPromise;
        }, this._timeoutSettings.navigationTimeout(options));
        await this._doSlowMo();
        return response;
    }
    async goForward(controller, options) {
        this.mainFrame().setupNavigationProgressController(controller);
        const response = await controller.run(async (progress) => {
            const waitPromise = this.mainFrame()._waitForNavigation(progress, options);
            const result = await this._delegate.goForward();
            if (!result) {
                waitPromise.catch(() => { });
                return null;
            }
            return waitPromise;
        }, this._timeoutSettings.navigationTimeout(options));
        await this._doSlowMo();
        return response;
    }
    async emulateMedia(options) {
        if (options.media !== undefined)
            utils_1.assert(options.media === null || types.mediaTypes.has(options.media), 'media: expected one of (screen|print|null)');
        if (options.colorScheme !== undefined)
            utils_1.assert(options.colorScheme === null || types.colorSchemes.has(options.colorScheme), 'colorScheme: expected one of (dark|light|no-preference|null)');
        if (options.media !== undefined)
            this._state.mediaType = options.media;
        if (options.colorScheme !== undefined)
            this._state.colorScheme = options.colorScheme;
        await this._delegate.updateEmulateMedia();
        await this._doSlowMo();
    }
    async setViewportSize(viewportSize) {
        this._state.viewportSize = { ...viewportSize };
        await this._delegate.setViewportSize(this._state.viewportSize);
        await this._doSlowMo();
    }
    viewportSize() {
        return this._state.viewportSize;
    }
    async bringToFront() {
        await this._delegate.bringToFront();
    }
    async _addInitScriptExpression(source) {
        this._evaluateOnNewDocumentSources.push(source);
        await this._delegate.evaluateOnNewDocument(source);
    }
    _needsRequestInterception() {
        return !!this._clientRequestInterceptor || !!this._serverRequestInterceptor || !!this._browserContext._requestInterceptor;
    }
    async _setClientRequestInterceptor(handler) {
        this._clientRequestInterceptor = handler;
        await this._delegate.updateRequestInterception();
    }
    async _setServerRequestInterceptor(handler) {
        this._serverRequestInterceptor = handler;
        await this._delegate.updateRequestInterception();
    }
    _requestStarted(request) {
        this.emit(Page.Events.Request, request);
        const route = request._route();
        if (!route)
            return;
        if (this._serverRequestInterceptor) {
            this._serverRequestInterceptor(route, request);
            return;
        }
        if (this._clientRequestInterceptor) {
            this._clientRequestInterceptor(route, request);
            return;
        }
        if (this._browserContext._requestInterceptor) {
            this._browserContext._requestInterceptor(route, request);
            return;
        }
        route.continue();
    }
    async screenshot(options = {}) {
        return progress_1.runAbortableTask(progress => this._screenshotter.screenshotPage(progress, options), this._timeoutSettings.timeout(options));
    }
    async close(options) {
        if (this._closedState === 'closed')
            return;
        const runBeforeUnload = !!options && !!options.runBeforeUnload;
        if (this._closedState !== 'closing') {
            this._closedState = 'closing';
            utils_1.assert(!this._disconnected, 'Protocol error: Connection closed. Most likely the page has been closed.');
            // This might throw if the browser context containing the page closes
            // while we are trying to close the page.
            await this._delegate.closePage(runBeforeUnload).catch(e => debugLogger_1.debugLogger.log('error', e));
        }
        if (!runBeforeUnload)
            await this._closedPromise;
        if (this._ownedContext)
            await this._ownedContext.close();
    }
    _setIsError() {
        if (!this._frameManager.mainFrame())
            this._frameManager.frameAttached('<dummy>', null);
    }
    isClosed() {
        return this._closedState === 'closed';
    }
    _addWorker(workerId, worker) {
        this._workers.set(workerId, worker);
        this.emit(Page.Events.Worker, worker);
    }
    _removeWorker(workerId) {
        const worker = this._workers.get(workerId);
        if (!worker)
            return;
        worker.emit(Worker.Events.Close, worker);
        this._workers.delete(workerId);
    }
    _clearWorkers() {
        for (const [workerId, worker] of this._workers) {
            worker.emit(Worker.Events.Close, worker);
            this._workers.delete(workerId);
        }
    }
    async _setFileChooserIntercepted(enabled) {
        await this._delegate.setFileChooserIntercepted(enabled);
    }
    videoStarted(video) {
        this._video = video;
        this.emit(Page.Events.VideoStarted, video);
    }
    frameNavigatedToNewDocument(frame) {
        this.emit(Page.Events.InternalFrameNavigatedToNewDocument, frame);
        const url = frame.url();
        if (!url.startsWith('http'))
            return;
        this._browserContext.addVisitedOrigin(new URL(url).origin);
    }
    allBindings() {
        return [...this._browserContext._pageBindings.values(), ...this._pageBindings.values()];
    }
    getBinding(name, world) {
        const identifier = PageBinding.identifier(name, world);
        return this._pageBindings.get(identifier) || this._browserContext._pageBindings.get(identifier);
    }
}
exports.Page = Page;
Page.Events = {
    Close: 'close',
    Crash: 'crash',
    Console: 'console',
    Dialog: 'dialog',
    InternalDialogClosed: 'internaldialogclosed',
    Download: 'download',
    FileChooser: 'filechooser',
    DOMContentLoaded: 'domcontentloaded',
    // Can't use just 'error' due to node.js special treatment of error events.
    // @see https://nodejs.org/api/events.html#events_error_events
    PageError: 'pageerror',
    Request: 'request',
    Response: 'response',
    RequestFailed: 'requestfailed',
    RequestFinished: 'requestfinished',
    FrameAttached: 'frameattached',
    FrameDetached: 'framedetached',
    InternalFrameNavigatedToNewDocument: 'internalframenavigatedtonewdocument',
    Load: 'load',
    Popup: 'popup',
    WebSocket: 'websocket',
    Worker: 'worker',
    VideoStarted: 'videostarted',
};
class Worker extends events_1.EventEmitter {
    constructor(url) {
        super();
        this._existingExecutionContext = null;
        this._url = url;
        this._executionContextCallback = () => { };
        this._executionContextPromise = new Promise(x => this._executionContextCallback = x);
    }
    _createExecutionContext(delegate) {
        this._existingExecutionContext = new js.ExecutionContext(delegate);
        this._executionContextCallback(this._existingExecutionContext);
    }
    url() {
        return this._url;
    }
    async _evaluateExpression(expression, isFunction, arg) {
        return js.evaluateExpression(await this._executionContextPromise, true /* returnByValue */, expression, isFunction, arg);
    }
    async _evaluateExpressionHandle(expression, isFunction, arg) {
        return js.evaluateExpression(await this._executionContextPromise, false /* returnByValue */, expression, isFunction, arg);
    }
}
exports.Worker = Worker;
Worker.Events = {
    Close: 'close',
};
class PageBinding {
    constructor(name, playwrightFunction, needsHandle, world) {
        this.name = name;
        this.playwrightFunction = playwrightFunction;
        this.source = `(${addPageBinding.toString()})(${JSON.stringify(name)}, ${needsHandle})`;
        this.needsHandle = needsHandle;
        this.world = world;
    }
    static identifier(name, world) {
        return world + ':' + name;
    }
    static async dispatch(page, payload, context) {
        const { name, seq, args } = JSON.parse(payload);
        try {
            utils_1.assert(context.world);
            const binding = page.getBinding(name, context.world);
            let result;
            if (binding.needsHandle) {
                const handle = await context.evaluateHandleInternal(takeHandle, { name, seq }).catch(e => null);
                result = await binding.playwrightFunction({ frame: context.frame, page, context: page._browserContext }, handle);
            }
            else {
                result = await binding.playwrightFunction({ frame: context.frame, page, context: page._browserContext }, ...args);
            }
            context.evaluateInternal(deliverResult, { name, seq, result }).catch(e => debugLogger_1.debugLogger.log('error', e));
        }
        catch (error) {
            if (utils_1.isError(error))
                context.evaluateInternal(deliverError, { name, seq, message: error.message, stack: error.stack }).catch(e => debugLogger_1.debugLogger.log('error', e));
            else
                context.evaluateInternal(deliverErrorValue, { name, seq, error }).catch(e => debugLogger_1.debugLogger.log('error', e));
        }
        function takeHandle(arg) {
            const handle = window[arg.name]['handles'].get(arg.seq);
            window[arg.name]['handles'].delete(arg.seq);
            return handle;
        }
        function deliverResult(arg) {
            window[arg.name]['callbacks'].get(arg.seq).resolve(arg.result);
            window[arg.name]['callbacks'].delete(arg.seq);
        }
        function deliverError(arg) {
            const error = new Error(arg.message);
            error.stack = arg.stack;
            window[arg.name]['callbacks'].get(arg.seq).reject(error);
            window[arg.name]['callbacks'].delete(arg.seq);
        }
        function deliverErrorValue(arg) {
            window[arg.name]['callbacks'].get(arg.seq).reject(arg.error);
            window[arg.name]['callbacks'].delete(arg.seq);
        }
    }
}
exports.PageBinding = PageBinding;
function addPageBinding(bindingName, needsHandle) {
    const binding = window[bindingName];
    if (binding.__installed)
        return;
    window[bindingName] = (...args) => {
        const me = window[bindingName];
        if (needsHandle && args.slice(1).some(arg => arg !== undefined))
            throw new Error(`exposeBindingHandle supports a single argument, ${args.length} received`);
        let callbacks = me['callbacks'];
        if (!callbacks) {
            callbacks = new Map();
            me['callbacks'] = callbacks;
        }
        const seq = (me['lastSeq'] || 0) + 1;
        me['lastSeq'] = seq;
        let handles = me['handles'];
        if (!handles) {
            handles = new Map();
            me['handles'] = handles;
        }
        const promise = new Promise((resolve, reject) => callbacks.set(seq, { resolve, reject }));
        if (needsHandle) {
            handles.set(seq, args[0]);
            binding(JSON.stringify({ name: bindingName, seq }));
        }
        else {
            binding(JSON.stringify({ name: bindingName, seq, args }));
        }
        return promise;
    };
    window[bindingName].__installed = true;
}
//# sourceMappingURL=page.js.map