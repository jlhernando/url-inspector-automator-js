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
exports.determineScreenshotType = exports.convertInputFiles = exports.convertSelectOptionValues = exports.ElementHandle = void 0;
const frame_1 = require("./frame");
const jsHandle_1 = require("./jsHandle");
const fs = require("fs");
const mime = require("mime");
const path = require("path");
const util = require("util");
const utils_1 = require("../utils/utils");
const fsWriteFileAsync = util.promisify(fs.writeFile.bind(fs));
class ElementHandle extends jsHandle_1.JSHandle {
    constructor(parent, type, guid, initializer) {
        super(parent, type, guid, initializer);
        this._elementChannel = this._channel;
    }
    static from(handle) {
        return handle._object;
    }
    static fromNullable(handle) {
        return handle ? ElementHandle.from(handle) : null;
    }
    asElement() {
        return this;
    }
    async ownerFrame() {
        return this._wrapApiCall('elementHandle.ownerFrame', async () => {
            return frame_1.Frame.fromNullable((await this._elementChannel.ownerFrame()).frame);
        });
    }
    async contentFrame() {
        return this._wrapApiCall('elementHandle.contentFrame', async () => {
            return frame_1.Frame.fromNullable((await this._elementChannel.contentFrame()).frame);
        });
    }
    async getAttribute(name) {
        return this._wrapApiCall('elementHandle.getAttribute', async () => {
            const value = (await this._elementChannel.getAttribute({ name })).value;
            return value === undefined ? null : value;
        });
    }
    async textContent() {
        return this._wrapApiCall('elementHandle.textContent', async () => {
            const value = (await this._elementChannel.textContent()).value;
            return value === undefined ? null : value;
        });
    }
    async innerText() {
        return this._wrapApiCall('elementHandle.innerText', async () => {
            return (await this._elementChannel.innerText()).value;
        });
    }
    async innerHTML() {
        return this._wrapApiCall('elementHandle.innerHTML', async () => {
            return (await this._elementChannel.innerHTML()).value;
        });
    }
    async isChecked() {
        return this._wrapApiCall('elementHandle.isChecked', async () => {
            return (await this._elementChannel.isChecked()).value;
        });
    }
    async isDisabled() {
        return this._wrapApiCall('elementHandle.isDisabled', async () => {
            return (await this._elementChannel.isDisabled()).value;
        });
    }
    async isEditable() {
        return this._wrapApiCall('elementHandle.isEditable', async () => {
            return (await this._elementChannel.isEditable()).value;
        });
    }
    async isEnabled() {
        return this._wrapApiCall('elementHandle.isEnabled', async () => {
            return (await this._elementChannel.isEnabled()).value;
        });
    }
    async isHidden() {
        return this._wrapApiCall('elementHandle.isHidden', async () => {
            return (await this._elementChannel.isHidden()).value;
        });
    }
    async isVisible() {
        return this._wrapApiCall('elementHandle.isVisible', async () => {
            return (await this._elementChannel.isVisible()).value;
        });
    }
    async dispatchEvent(type, eventInit = {}) {
        return this._wrapApiCall('elementHandle.dispatchEvent', async () => {
            await this._elementChannel.dispatchEvent({ type, eventInit: jsHandle_1.serializeArgument(eventInit) });
        });
    }
    async scrollIntoViewIfNeeded(options = {}) {
        return this._wrapApiCall('elementHandle.scrollIntoViewIfNeeded', async () => {
            await this._elementChannel.scrollIntoViewIfNeeded(options);
        });
    }
    async hover(options = {}) {
        return this._wrapApiCall('elementHandle.hover', async () => {
            await this._elementChannel.hover(options);
        });
    }
    async click(options = {}) {
        return this._wrapApiCall('elementHandle.click', async () => {
            return await this._elementChannel.click(options);
        });
    }
    async dblclick(options = {}) {
        return this._wrapApiCall('elementHandle.dblclick', async () => {
            return await this._elementChannel.dblclick(options);
        });
    }
    async tap(options = {}) {
        return this._wrapApiCall('elementHandle.tap', async () => {
            return await this._elementChannel.tap(options);
        });
    }
    async selectOption(values, options = {}) {
        return this._wrapApiCall('elementHandle.selectOption', async () => {
            const result = await this._elementChannel.selectOption({ ...convertSelectOptionValues(values), ...options });
            return result.values;
        });
    }
    async fill(value, options = {}) {
        return this._wrapApiCall('elementHandle.fill', async () => {
            return await this._elementChannel.fill({ value, ...options });
        });
    }
    async selectText(options = {}) {
        return this._wrapApiCall('elementHandle.selectText', async () => {
            await this._elementChannel.selectText(options);
        });
    }
    async setInputFiles(files, options = {}) {
        return this._wrapApiCall('elementHandle.setInputFiles', async () => {
            await this._elementChannel.setInputFiles({ files: await convertInputFiles(files), ...options });
        });
    }
    async focus() {
        return this._wrapApiCall('elementHandle.focus', async () => {
            await this._elementChannel.focus();
        });
    }
    async type(text, options = {}) {
        return this._wrapApiCall('elementHandle.type', async () => {
            await this._elementChannel.type({ text, ...options });
        });
    }
    async press(key, options = {}) {
        return this._wrapApiCall('elementHandle.press', async () => {
            await this._elementChannel.press({ key, ...options });
        });
    }
    async check(options = {}) {
        return this._wrapApiCall('elementHandle.check', async () => {
            return await this._elementChannel.check(options);
        });
    }
    async uncheck(options = {}) {
        return this._wrapApiCall('elementHandle.uncheck', async () => {
            return await this._elementChannel.uncheck(options);
        });
    }
    async boundingBox() {
        return this._wrapApiCall('elementHandle.boundingBox', async () => {
            const value = (await this._elementChannel.boundingBox()).value;
            return value === undefined ? null : value;
        });
    }
    async screenshot(options = {}) {
        return this._wrapApiCall('elementHandle.screenshot', async () => {
            const copy = { ...options };
            if (!copy.type)
                copy.type = determineScreenshotType(options);
            const result = await this._elementChannel.screenshot(copy);
            const buffer = Buffer.from(result.binary, 'base64');
            if (options.path) {
                await utils_1.mkdirIfNeeded(options.path);
                await fsWriteFileAsync(options.path, buffer);
            }
            return buffer;
        });
    }
    async $(selector) {
        return this._wrapApiCall('elementHandle.$', async () => {
            return ElementHandle.fromNullable((await this._elementChannel.querySelector({ selector })).element);
        });
    }
    async $$(selector) {
        return this._wrapApiCall('elementHandle.$$', async () => {
            const result = await this._elementChannel.querySelectorAll({ selector });
            return result.elements.map(h => ElementHandle.from(h));
        });
    }
    async $eval(selector, pageFunction, arg) {
        return this._wrapApiCall('elementHandle.$eval', async () => {
            const result = await this._elementChannel.evalOnSelector({ selector, expression: String(pageFunction), isFunction: typeof pageFunction === 'function', arg: jsHandle_1.serializeArgument(arg) });
            return jsHandle_1.parseResult(result.value);
        });
    }
    async $$eval(selector, pageFunction, arg) {
        return this._wrapApiCall('elementHandle.$$eval', async () => {
            const result = await this._elementChannel.evalOnSelectorAll({ selector, expression: String(pageFunction), isFunction: typeof pageFunction === 'function', arg: jsHandle_1.serializeArgument(arg) });
            return jsHandle_1.parseResult(result.value);
        });
    }
    async waitForElementState(state, options = {}) {
        return this._wrapApiCall('elementHandle.waitForElementState', async () => {
            return await this._elementChannel.waitForElementState({ state, ...options });
        });
    }
    async waitForSelector(selector, options = {}) {
        return this._wrapApiCall('elementHandle.waitForSelector', async () => {
            const result = await this._elementChannel.waitForSelector({ selector, ...options });
            return ElementHandle.fromNullable(result.element);
        });
    }
}
exports.ElementHandle = ElementHandle;
function convertSelectOptionValues(values) {
    if (values === null)
        return {};
    if (!Array.isArray(values))
        values = [values];
    if (!values.length)
        return {};
    for (let i = 0; i < values.length; i++)
        utils_1.assert(values[i] !== null, `options[${i}]: expected object, got null`);
    if (values[0] instanceof ElementHandle)
        return { elements: values.map((v) => v._elementChannel) };
    if (utils_1.isString(values[0]))
        return { options: values.map(value => ({ value })) };
    return { options: values };
}
exports.convertSelectOptionValues = convertSelectOptionValues;
async function convertInputFiles(files) {
    const items = Array.isArray(files) ? files : [files];
    const filePayloads = await Promise.all(items.map(async (item) => {
        if (typeof item === 'string') {
            return {
                name: path.basename(item),
                mimeType: mime.getType(item) || 'application/octet-stream',
                buffer: (await util.promisify(fs.readFile)(item)).toString('base64')
            };
        }
        else {
            return {
                name: item.name,
                mimeType: item.mimeType,
                buffer: item.buffer.toString('base64'),
            };
        }
    }));
    return filePayloads;
}
exports.convertInputFiles = convertInputFiles;
function determineScreenshotType(options) {
    if (options.path) {
        const mimeType = mime.getType(options.path);
        if (mimeType === 'image/png')
            return 'png';
        else if (mimeType === 'image/jpeg')
            return 'jpeg';
        throw new Error(`path: unsupported mime type "${mimeType}"`);
    }
    return options.type;
}
exports.determineScreenshotType = determineScreenshotType;
//# sourceMappingURL=elementHandle.js.map