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
exports.FrameDispatcher = void 0;
const frames_1 = require("../server/frames");
const dispatcher_1 = require("./dispatcher");
const elementHandlerDispatcher_1 = require("./elementHandlerDispatcher");
const jsHandleDispatcher_1 = require("./jsHandleDispatcher");
const networkDispatchers_1 = require("./networkDispatchers");
const browserContext_1 = require("../server/browserContext");
class FrameDispatcher extends dispatcher_1.Dispatcher {
    constructor(scope, frame) {
        super(scope, frame, 'Frame', {
            url: frame.url(),
            name: frame.name(),
            parentFrame: dispatcher_1.lookupNullableDispatcher(frame.parentFrame()),
            loadStates: Array.from(frame._subtreeLifecycleEvents),
        });
        this._frame = frame;
        frame.on(frames_1.Frame.Events.AddLifecycle, lifecycleEvent => {
            this._dispatchEvent('loadstate', { add: lifecycleEvent });
        });
        frame.on(frames_1.Frame.Events.RemoveLifecycle, lifecycleEvent => {
            this._dispatchEvent('loadstate', { remove: lifecycleEvent });
        });
        frame.on(frames_1.Frame.Events.Navigation, (event) => {
            const params = { url: event.url, name: event.name, error: event.error ? event.error.message : undefined };
            if (event.newDocument)
                params.newDocument = { request: networkDispatchers_1.RequestDispatcher.fromNullable(this._scope, event.newDocument.request || null) };
            this._dispatchEvent('navigated', params);
        });
    }
    static from(scope, frame) {
        const result = dispatcher_1.existingDispatcher(frame);
        return result || new FrameDispatcher(scope, frame);
    }
    async goto(params, metadata) {
        return await browserContext_1.runAction(async (controller) => {
            return { response: dispatcher_1.lookupNullableDispatcher(await this._frame.goto(controller, params.url, params)) };
        }, { ...metadata, type: 'goto', value: params.url, page: this._frame._page });
    }
    async frameElement() {
        return { element: new elementHandlerDispatcher_1.ElementHandleDispatcher(this._scope, await this._frame.frameElement()) };
    }
    async evaluateExpression(params) {
        return { value: jsHandleDispatcher_1.serializeResult(await this._frame._evaluateExpression(params.expression, params.isFunction, jsHandleDispatcher_1.parseArgument(params.arg), params.world)) };
    }
    async evaluateExpressionHandle(params) {
        return { handle: elementHandlerDispatcher_1.createHandle(this._scope, await this._frame._evaluateExpressionHandle(params.expression, params.isFunction, jsHandleDispatcher_1.parseArgument(params.arg), params.world)) };
    }
    async waitForSelector(params) {
        return { element: elementHandlerDispatcher_1.ElementHandleDispatcher.createNullable(this._scope, await this._frame.waitForSelector(params.selector, params)) };
    }
    async dispatchEvent(params) {
        return this._frame.dispatchEvent(params.selector, params.type, jsHandleDispatcher_1.parseArgument(params.eventInit), params);
    }
    async evalOnSelector(params) {
        return { value: jsHandleDispatcher_1.serializeResult(await this._frame._$evalExpression(params.selector, params.expression, params.isFunction, jsHandleDispatcher_1.parseArgument(params.arg))) };
    }
    async evalOnSelectorAll(params) {
        return { value: jsHandleDispatcher_1.serializeResult(await this._frame._$$evalExpression(params.selector, params.expression, params.isFunction, jsHandleDispatcher_1.parseArgument(params.arg))) };
    }
    async querySelector(params) {
        return { element: elementHandlerDispatcher_1.ElementHandleDispatcher.createNullable(this._scope, await this._frame.$(params.selector)) };
    }
    async querySelectorAll(params) {
        const elements = await this._frame.$$(params.selector);
        return { elements: elements.map(e => new elementHandlerDispatcher_1.ElementHandleDispatcher(this._scope, e)) };
    }
    async content() {
        return { value: await this._frame.content() };
    }
    async setContent(params, metadata) {
        return await browserContext_1.runAction(async (controller) => {
            return await this._frame.setContent(controller, params.html, params);
        }, { ...metadata, type: 'setContent', value: params.html, page: this._frame._page });
    }
    async addScriptTag(params) {
        return { element: new elementHandlerDispatcher_1.ElementHandleDispatcher(this._scope, await this._frame.addScriptTag(params)) };
    }
    async addStyleTag(params) {
        return { element: new elementHandlerDispatcher_1.ElementHandleDispatcher(this._scope, await this._frame.addStyleTag(params)) };
    }
    async click(params, metadata) {
        return browserContext_1.runAction(async (controller) => {
            return await this._frame.click(controller, params.selector, params);
        }, { ...metadata, type: 'click', target: params.selector, page: this._frame._page });
    }
    async dblclick(params, metadata) {
        return browserContext_1.runAction(async (controller) => {
            return await this._frame.dblclick(controller, params.selector, params);
        }, { ...metadata, type: 'dblclick', target: params.selector, page: this._frame._page });
    }
    async tap(params, metadata) {
        return browserContext_1.runAction(async (controller) => {
            return await this._frame.tap(controller, params.selector, params);
        }, { ...metadata, type: 'tap', target: params.selector, page: this._frame._page });
    }
    async fill(params, metadata) {
        return browserContext_1.runAction(async (controller) => {
            return await this._frame.fill(controller, params.selector, params.value, params);
        }, { ...metadata, type: 'fill', value: params.value, target: params.selector, page: this._frame._page });
    }
    async focus(params) {
        await this._frame.focus(params.selector, params);
    }
    async textContent(params) {
        const value = await this._frame.textContent(params.selector, params);
        return { value: value === null ? undefined : value };
    }
    async innerText(params) {
        return { value: await this._frame.innerText(params.selector, params) };
    }
    async innerHTML(params) {
        return { value: await this._frame.innerHTML(params.selector, params) };
    }
    async getAttribute(params) {
        const value = await this._frame.getAttribute(params.selector, params.name, params);
        return { value: value === null ? undefined : value };
    }
    async isChecked(params) {
        return { value: await this._frame.isChecked(params.selector, params) };
    }
    async isDisabled(params) {
        return { value: await this._frame.isDisabled(params.selector, params) };
    }
    async isEditable(params) {
        return { value: await this._frame.isEditable(params.selector, params) };
    }
    async isEnabled(params) {
        return { value: await this._frame.isEnabled(params.selector, params) };
    }
    async isHidden(params) {
        return { value: await this._frame.isHidden(params.selector, params) };
    }
    async isVisible(params) {
        return { value: await this._frame.isVisible(params.selector, params) };
    }
    async hover(params, metadata) {
        return browserContext_1.runAction(async (controller) => {
            return await this._frame.hover(controller, params.selector, params);
        }, { ...metadata, type: 'hover', target: params.selector, page: this._frame._page });
    }
    async selectOption(params, metadata) {
        return browserContext_1.runAction(async (controller) => {
            const elements = (params.elements || []).map(e => e._elementHandle);
            return { values: await this._frame.selectOption(controller, params.selector, elements, params.options || [], params) };
        }, { ...metadata, type: 'selectOption', target: params.selector, page: this._frame._page });
    }
    async setInputFiles(params, metadata) {
        return browserContext_1.runAction(async (controller) => {
            return await this._frame.setInputFiles(controller, params.selector, params.files, params);
        }, { ...metadata, type: 'setInputFiles', target: params.selector, page: this._frame._page });
    }
    async type(params, metadata) {
        return browserContext_1.runAction(async (controller) => {
            return await this._frame.type(controller, params.selector, params.text, params);
        }, { ...metadata, type: 'type', value: params.text, target: params.selector, page: this._frame._page });
    }
    async press(params, metadata) {
        return browserContext_1.runAction(async (controller) => {
            return await this._frame.press(controller, params.selector, params.key, params);
        }, { ...metadata, type: 'press', value: params.key, target: params.selector, page: this._frame._page });
    }
    async check(params, metadata) {
        return browserContext_1.runAction(async (controller) => {
            return await this._frame.check(controller, params.selector, params);
        }, { ...metadata, type: 'check', target: params.selector, page: this._frame._page });
    }
    async uncheck(params, metadata) {
        return browserContext_1.runAction(async (controller) => {
            return await this._frame.uncheck(controller, params.selector, params);
        }, { ...metadata, type: 'uncheck', target: params.selector, page: this._frame._page });
    }
    async waitForFunction(params) {
        return { handle: elementHandlerDispatcher_1.createHandle(this._scope, await this._frame._waitForFunctionExpression(params.expression, params.isFunction, jsHandleDispatcher_1.parseArgument(params.arg), params)) };
    }
    async title() {
        return { value: await this._frame.title() };
    }
}
exports.FrameDispatcher = FrameDispatcher;
//# sourceMappingURL=frameDispatcher.js.map