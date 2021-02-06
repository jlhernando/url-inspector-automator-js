"use strict";
/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BindingCallDispatcher = exports.WorkerDispatcher = exports.PageDispatcher = void 0;
const browserContext_1 = require("../server/browserContext");
const page_1 = require("../server/page");
const dispatcher_1 = require("./dispatcher");
const serializers_1 = require("../protocol/serializers");
const consoleMessageDispatcher_1 = require("./consoleMessageDispatcher");
const dialogDispatcher_1 = require("./dialogDispatcher");
const downloadDispatcher_1 = require("./downloadDispatcher");
const frameDispatcher_1 = require("./frameDispatcher");
const networkDispatchers_1 = require("./networkDispatchers");
const jsHandleDispatcher_1 = require("./jsHandleDispatcher");
const elementHandlerDispatcher_1 = require("./elementHandlerDispatcher");
class PageDispatcher extends dispatcher_1.Dispatcher {
    constructor(scope, page) {
        // TODO: theoretically, there could be more than one frame already.
        // If we split pageCreated and pageReady, there should be no main frame during pageCreated.
        super(scope, page, 'Page', {
            mainFrame: frameDispatcher_1.FrameDispatcher.from(scope, page.mainFrame()),
            videoRelativePath: page._video ? page._video._relativePath : undefined,
            viewportSize: page.viewportSize() || undefined,
            isClosed: page.isClosed()
        }, true);
        this._page = page;
        page.on(page_1.Page.Events.Close, () => {
            this._dispatchEvent('close');
            this._dispose();
        });
        page.on(page_1.Page.Events.Console, message => this._dispatchEvent('console', { message: new consoleMessageDispatcher_1.ConsoleMessageDispatcher(this._scope, message) }));
        page.on(page_1.Page.Events.Crash, () => this._dispatchEvent('crash'));
        page.on(page_1.Page.Events.DOMContentLoaded, () => this._dispatchEvent('domcontentloaded'));
        page.on(page_1.Page.Events.Dialog, dialog => this._dispatchEvent('dialog', { dialog: new dialogDispatcher_1.DialogDispatcher(this._scope, dialog) }));
        page.on(page_1.Page.Events.Download, download => this._dispatchEvent('download', { download: new downloadDispatcher_1.DownloadDispatcher(scope, download) }));
        this._page.on(page_1.Page.Events.FileChooser, (fileChooser) => this._dispatchEvent('fileChooser', {
            element: new elementHandlerDispatcher_1.ElementHandleDispatcher(this._scope, fileChooser.element()),
            isMultiple: fileChooser.isMultiple()
        }));
        page.on(page_1.Page.Events.FrameAttached, frame => this._onFrameAttached(frame));
        page.on(page_1.Page.Events.FrameDetached, frame => this._onFrameDetached(frame));
        page.on(page_1.Page.Events.Load, () => this._dispatchEvent('load'));
        page.on(page_1.Page.Events.PageError, error => this._dispatchEvent('pageError', { error: serializers_1.serializeError(error) }));
        page.on(page_1.Page.Events.Popup, page => this._dispatchEvent('popup', { page: dispatcher_1.lookupDispatcher(page) }));
        page.on(page_1.Page.Events.Request, request => this._dispatchEvent('request', { request: networkDispatchers_1.RequestDispatcher.from(this._scope, request) }));
        page.on(page_1.Page.Events.RequestFailed, (request) => this._dispatchEvent('requestFailed', {
            request: networkDispatchers_1.RequestDispatcher.from(this._scope, request),
            failureText: request._failureText,
            responseEndTiming: request._responseEndTiming
        }));
        page.on(page_1.Page.Events.RequestFinished, (request) => this._dispatchEvent('requestFinished', {
            request: networkDispatchers_1.RequestDispatcher.from(scope, request),
            responseEndTiming: request._responseEndTiming
        }));
        page.on(page_1.Page.Events.Response, response => this._dispatchEvent('response', { response: new networkDispatchers_1.ResponseDispatcher(this._scope, response) }));
        page.on(page_1.Page.Events.VideoStarted, (video) => this._dispatchEvent('video', { relativePath: video._relativePath }));
        page.on(page_1.Page.Events.WebSocket, webSocket => this._dispatchEvent('webSocket', { webSocket: new networkDispatchers_1.WebSocketDispatcher(this._scope, webSocket) }));
        page.on(page_1.Page.Events.Worker, worker => this._dispatchEvent('worker', { worker: new WorkerDispatcher(this._scope, worker) }));
    }
    async setDefaultNavigationTimeoutNoReply(params) {
        this._page.setDefaultNavigationTimeout(params.timeout);
    }
    async setDefaultTimeoutNoReply(params) {
        this._page.setDefaultTimeout(params.timeout);
    }
    async opener() {
        return { page: dispatcher_1.lookupNullableDispatcher(await this._page.opener()) };
    }
    async exposeBinding(params) {
        await this._page.exposeBinding(params.name, !!params.needsHandle, (source, ...args) => {
            const binding = new BindingCallDispatcher(this._scope, params.name, !!params.needsHandle, source, args);
            this._dispatchEvent('bindingCall', { binding });
            return binding.promise();
        });
    }
    async setExtraHTTPHeaders(params) {
        await this._page.setExtraHTTPHeaders(params.headers);
    }
    async reload(params, metadata) {
        return await browserContext_1.runAction(async (controller) => {
            return { response: dispatcher_1.lookupNullableDispatcher(await this._page.reload(controller, params)) };
        }, { ...metadata, type: 'reload', page: this._page });
    }
    async goBack(params, metadata) {
        return await browserContext_1.runAction(async (controller) => {
            return { response: dispatcher_1.lookupNullableDispatcher(await this._page.goBack(controller, params)) };
        }, { ...metadata, type: 'goBack', page: this._page });
    }
    async goForward(params, metadata) {
        return await browserContext_1.runAction(async (controller) => {
            return { response: dispatcher_1.lookupNullableDispatcher(await this._page.goForward(controller, params)) };
        }, { ...metadata, type: 'goForward', page: this._page });
    }
    async emulateMedia(params) {
        await this._page.emulateMedia({
            media: params.media === 'null' ? null : params.media,
            colorScheme: params.colorScheme === 'null' ? null : params.colorScheme,
        });
    }
    async setViewportSize(params) {
        await this._page.setViewportSize(params.viewportSize);
    }
    async addInitScript(params) {
        await this._page._addInitScriptExpression(params.source);
    }
    async setNetworkInterceptionEnabled(params) {
        if (!params.enabled) {
            await this._page._setClientRequestInterceptor(undefined);
            return;
        }
        this._page._setClientRequestInterceptor((route, request) => {
            this._dispatchEvent('route', { route: new networkDispatchers_1.RouteDispatcher(this._scope, route), request: networkDispatchers_1.RequestDispatcher.from(this._scope, request) });
        });
    }
    async screenshot(params) {
        return { binary: (await this._page.screenshot(params)).toString('base64') };
    }
    async close(params) {
        await this._page.close(params);
    }
    async setFileChooserInterceptedNoReply(params) {
        await this._page._setFileChooserIntercepted(params.intercepted);
    }
    async keyboardDown(params) {
        await this._page.keyboard.down(params.key);
    }
    async keyboardUp(params) {
        await this._page.keyboard.up(params.key);
    }
    async keyboardInsertText(params) {
        await this._page.keyboard.insertText(params.text);
    }
    async keyboardType(params) {
        await this._page.keyboard.type(params.text, params);
    }
    async keyboardPress(params) {
        await this._page.keyboard.press(params.key, params);
    }
    async mouseMove(params) {
        await this._page.mouse.move(params.x, params.y, params);
    }
    async mouseDown(params) {
        await this._page.mouse.down(params);
    }
    async mouseUp(params) {
        await this._page.mouse.up(params);
    }
    async mouseClick(params) {
        await this._page.mouse.click(params.x, params.y, params);
    }
    async touchscreenTap(params) {
        await this._page.touchscreen.tap(params.x, params.y);
    }
    async accessibilitySnapshot(params) {
        const rootAXNode = await this._page.accessibility.snapshot({
            interestingOnly: params.interestingOnly,
            root: params.root ? params.root._elementHandle : undefined
        });
        return { rootAXNode: rootAXNode || undefined };
    }
    async pdf(params) {
        if (!this._page.pdf)
            throw new Error('PDF generation is only supported for Headless Chromium');
        const buffer = await this._page.pdf(params);
        return { pdf: buffer.toString('base64') };
    }
    async bringToFront() {
        await this._page.bringToFront();
    }
    async crStartJSCoverage(params) {
        const coverage = this._page.coverage;
        await coverage.startJSCoverage(params);
    }
    async crStopJSCoverage() {
        const coverage = this._page.coverage;
        return { entries: await coverage.stopJSCoverage() };
    }
    async crStartCSSCoverage(params) {
        const coverage = this._page.coverage;
        await coverage.startCSSCoverage(params);
    }
    async crStopCSSCoverage() {
        const coverage = this._page.coverage;
        return { entries: await coverage.stopCSSCoverage() };
    }
    _onFrameAttached(frame) {
        this._dispatchEvent('frameAttached', { frame: frameDispatcher_1.FrameDispatcher.from(this._scope, frame) });
    }
    _onFrameDetached(frame) {
        this._dispatchEvent('frameDetached', { frame: dispatcher_1.lookupDispatcher(frame) });
    }
}
exports.PageDispatcher = PageDispatcher;
class WorkerDispatcher extends dispatcher_1.Dispatcher {
    constructor(scope, worker) {
        super(scope, worker, 'Worker', {
            url: worker.url()
        });
        worker.on(page_1.Worker.Events.Close, () => this._dispatchEvent('close'));
    }
    async evaluateExpression(params) {
        return { value: jsHandleDispatcher_1.serializeResult(await this._object._evaluateExpression(params.expression, params.isFunction, jsHandleDispatcher_1.parseArgument(params.arg))) };
    }
    async evaluateExpressionHandle(params) {
        return { handle: elementHandlerDispatcher_1.createHandle(this._scope, await this._object._evaluateExpressionHandle(params.expression, params.isFunction, jsHandleDispatcher_1.parseArgument(params.arg))) };
    }
}
exports.WorkerDispatcher = WorkerDispatcher;
class BindingCallDispatcher extends dispatcher_1.Dispatcher {
    constructor(scope, name, needsHandle, source, args) {
        super(scope, {}, 'BindingCall', {
            frame: dispatcher_1.lookupDispatcher(source.frame),
            name,
            args: needsHandle ? undefined : args.map(jsHandleDispatcher_1.serializeResult),
            handle: needsHandle ? elementHandlerDispatcher_1.createHandle(scope, args[0]) : undefined,
        });
        this._promise = new Promise((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });
    }
    promise() {
        return this._promise;
    }
    async resolve(params) {
        this._resolve(jsHandleDispatcher_1.parseArgument(params.result));
    }
    async reject(params) {
        this._reject(serializers_1.parseError(params.error));
    }
}
exports.BindingCallDispatcher = BindingCallDispatcher;
//# sourceMappingURL=pageDispatcher.js.map