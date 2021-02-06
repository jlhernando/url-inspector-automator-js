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
exports.ElementHandleDispatcher = exports.createHandle = void 0;
const dispatcher_1 = require("./dispatcher");
const jsHandleDispatcher_1 = require("./jsHandleDispatcher");
const browserContext_1 = require("../server/browserContext");
function createHandle(scope, handle) {
    return handle.asElement() ? new ElementHandleDispatcher(scope, handle.asElement()) : new jsHandleDispatcher_1.JSHandleDispatcher(scope, handle);
}
exports.createHandle = createHandle;
class ElementHandleDispatcher extends jsHandleDispatcher_1.JSHandleDispatcher {
    constructor(scope, elementHandle) {
        super(scope, elementHandle);
        this._elementHandle = elementHandle;
    }
    static createNullable(scope, handle) {
        if (!handle)
            return undefined;
        return new ElementHandleDispatcher(scope, handle);
    }
    async ownerFrame() {
        return { frame: dispatcher_1.lookupNullableDispatcher(await this._elementHandle.ownerFrame()) };
    }
    async contentFrame() {
        return { frame: dispatcher_1.lookupNullableDispatcher(await this._elementHandle.contentFrame()) };
    }
    async getAttribute(params) {
        const value = await this._elementHandle.getAttribute(params.name);
        return { value: value === null ? undefined : value };
    }
    async textContent() {
        const value = await this._elementHandle.textContent();
        return { value: value === null ? undefined : value };
    }
    async innerText() {
        return { value: await this._elementHandle.innerText() };
    }
    async innerHTML() {
        return { value: await this._elementHandle.innerHTML() };
    }
    async isChecked() {
        return { value: await this._elementHandle.isChecked() };
    }
    async isDisabled() {
        return { value: await this._elementHandle.isDisabled() };
    }
    async isEditable() {
        return { value: await this._elementHandle.isEditable() };
    }
    async isEnabled() {
        return { value: await this._elementHandle.isEnabled() };
    }
    async isHidden() {
        return { value: await this._elementHandle.isHidden() };
    }
    async isVisible() {
        return { value: await this._elementHandle.isVisible() };
    }
    async dispatchEvent(params) {
        await this._elementHandle.dispatchEvent(params.type, jsHandleDispatcher_1.parseArgument(params.eventInit));
    }
    async scrollIntoViewIfNeeded(params) {
        await this._elementHandle.scrollIntoViewIfNeeded(params);
    }
    async hover(params, metadata) {
        return browserContext_1.runAction(async (controller) => {
            return await this._elementHandle.hover(controller, params);
        }, { ...metadata, type: 'hover', target: this._elementHandle, page: this._elementHandle._page });
    }
    async click(params, metadata) {
        return browserContext_1.runAction(async (controller) => {
            return await this._elementHandle.click(controller, params);
        }, { ...metadata, type: 'click', target: this._elementHandle, page: this._elementHandle._page });
    }
    async dblclick(params, metadata) {
        return browserContext_1.runAction(async (controller) => {
            return await this._elementHandle.dblclick(controller, params);
        }, { ...metadata, type: 'dblclick', target: this._elementHandle, page: this._elementHandle._page });
    }
    async tap(params, metadata) {
        return browserContext_1.runAction(async (controller) => {
            return await this._elementHandle.tap(controller, params);
        }, { ...metadata, type: 'tap', target: this._elementHandle, page: this._elementHandle._page });
    }
    async selectOption(params, metadata) {
        return browserContext_1.runAction(async (controller) => {
            const elements = (params.elements || []).map(e => e._elementHandle);
            return { values: await this._elementHandle.selectOption(controller, elements, params.options || [], params) };
        }, { ...metadata, type: 'selectOption', target: this._elementHandle, page: this._elementHandle._page });
    }
    async fill(params, metadata) {
        return browserContext_1.runAction(async (controller) => {
            return await this._elementHandle.fill(controller, params.value, params);
        }, { ...metadata, type: 'fill', value: params.value, target: this._elementHandle, page: this._elementHandle._page });
    }
    async selectText(params) {
        await this._elementHandle.selectText(params);
    }
    async setInputFiles(params, metadata) {
        return browserContext_1.runAction(async (controller) => {
            return await this._elementHandle.setInputFiles(controller, params.files, params);
        }, { ...metadata, type: 'setInputFiles', target: this._elementHandle, page: this._elementHandle._page });
    }
    async focus() {
        await this._elementHandle.focus();
    }
    async type(params, metadata) {
        return browserContext_1.runAction(async (controller) => {
            return await this._elementHandle.type(controller, params.text, params);
        }, { ...metadata, type: 'type', value: params.text, target: this._elementHandle, page: this._elementHandle._page });
    }
    async press(params, metadata) {
        return browserContext_1.runAction(async (controller) => {
            return await this._elementHandle.press(controller, params.key, params);
        }, { ...metadata, type: 'press', value: params.key, target: this._elementHandle, page: this._elementHandle._page });
    }
    async check(params, metadata) {
        return browserContext_1.runAction(async (controller) => {
            return await this._elementHandle.check(controller, params);
        }, { ...metadata, type: 'check', target: this._elementHandle, page: this._elementHandle._page });
    }
    async uncheck(params, metadata) {
        return browserContext_1.runAction(async (controller) => {
            return await this._elementHandle.uncheck(controller, params);
        }, { ...metadata, type: 'uncheck', target: this._elementHandle, page: this._elementHandle._page });
    }
    async boundingBox() {
        const value = await this._elementHandle.boundingBox();
        return { value: value || undefined };
    }
    async screenshot(params) {
        return { binary: (await this._elementHandle.screenshot(params)).toString('base64') };
    }
    async querySelector(params) {
        const handle = await this._elementHandle.$(params.selector);
        return { element: handle ? new ElementHandleDispatcher(this._scope, handle) : undefined };
    }
    async querySelectorAll(params) {
        const elements = await this._elementHandle.$$(params.selector);
        return { elements: elements.map(e => new ElementHandleDispatcher(this._scope, e)) };
    }
    async evalOnSelector(params) {
        return { value: jsHandleDispatcher_1.serializeResult(await this._elementHandle._$evalExpression(params.selector, params.expression, params.isFunction, jsHandleDispatcher_1.parseArgument(params.arg))) };
    }
    async evalOnSelectorAll(params) {
        return { value: jsHandleDispatcher_1.serializeResult(await this._elementHandle._$$evalExpression(params.selector, params.expression, params.isFunction, jsHandleDispatcher_1.parseArgument(params.arg))) };
    }
    async waitForElementState(params) {
        await this._elementHandle.waitForElementState(params.state, params);
    }
    async waitForSelector(params) {
        return { element: ElementHandleDispatcher.createNullable(this._scope, await this._elementHandle.waitForSelector(params.selector, params)) };
    }
}
exports.ElementHandleDispatcher = ElementHandleDispatcher;
//# sourceMappingURL=elementHandlerDispatcher.js.map